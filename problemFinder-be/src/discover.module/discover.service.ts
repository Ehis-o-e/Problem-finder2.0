import { classifyPosts } from "../classifier.module/classifier.service";
import type { ClassifiedPost } from "../classifier.module/classifier.service";
import { fetchPosts } from "../fetcher.module/fetcher.service";
import { filterPosts } from "../filter.module/filter.service";
import { parseQuery } from "../queryParser.module/queryParser.service";
import type { SubredditResult } from "../queryParser.module/queryParser.service"
import {
  getSessionPool,
  getProblemsByCategory,
  saveSessionPool,
  SessionPoolItem,
  SessionPoolState,
  type StoredProblem,
  storePosts,
} from "../storage.module/storage.service";
import { callAI } from "../config/ai.config";

export interface DiscoveryPipelineResult {
  category: string;
  matchedKeywords: string[];
  subreddits: SubredditResult[];
  candidates: ClassifiedPost[];
  pipeline: {
    fetched: number;
    afterFilter: number;
    afterClassification: number;
    saved: number;
    duplicates: number;
    total: number;
  };
  problems: StoredProblem[];
}

export interface CuratedProblem {
  index: number;
  title: string;
  summary: string;
  category: string;
  upvotes: number;
  url: string;
}

const DEFAULT_RESULT_COUNT = 3;
const MAX_RESULT_COUNT = 10;

function hasUsableUrl(url: string | null | undefined): url is string {
  return typeof url === "string" && url.trim().length > 0;
}

function toSessionPoolItemsFromStoredProblems(
  problems: StoredProblem[]
): SessionPoolItem[] {
  return [...problems]
    .filter((problem) => hasUsableUrl(problem.url))
    .sort((a, b) => b.upvotes - a.upvotes)
    .map((problem) => ({
      id: problem.id,
      title: trimText(problem.title, 120),
      body: trimText(problem.summary ?? problem.title, 900),
      category: problem.category,
      confidenceScore: problem.confidenceScore ?? 0,
      upvotes: problem.upvotes,
      commentCount: 0,
      url: problem.url!,
      redditPostId: problem.id,
    }));
}

function trimText(value: string, maxLength: number): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) {
    return compact;
  }

  return `${compact.slice(0, maxLength).trim()}...`;
}

function toSessionPoolItems(posts: ClassifiedPost[]): SessionPoolItem[] {
  return [...posts]
    .filter((post) => hasUsableUrl(post.url))
    .sort((a, b) => b.upvotes - a.upvotes)
    .map((post) => ({
      id: post.redditPostId,
      title: trimText(post.title, 120),
      body: trimText(post.body, 900),
      category: post.category,
      confidenceScore: post.confidenceScore,
      upvotes: post.upvotes,
      commentCount: post.commentCount,
      url: post.url,
      redditPostId: post.redditPostId,
    }));
}

function looksLikeListRequest(userMessage: string): boolean {
  const normalised = userMessage.toLowerCase();
  return [
    "give me",
    "show me",
    "list",
    "ideas",
    "problems",
    "pain points",
    "more",
    "another",
  ].some((signal) => normalised.includes(signal));
}

export function extractRequestedCount(userMessage: string): number {
  const explicitCount = userMessage.match(/\b(\d{1,2})\b/);

  if (!looksLikeListRequest(userMessage)) {
    return 0;
  }

  if (!explicitCount) {
    return DEFAULT_RESULT_COUNT;
  }

  const parsedCount = Number.parseInt(explicitCount[1], 10);
  return Math.max(1, Math.min(parsedCount, MAX_RESULT_COUNT));
}

function getNextPoolIndexes(
  sessionPool: SessionPoolState,
  requestedCount: number
): number[] {
  const availableIndexes = sessionPool.items
    .map((_, index) => index)
    .filter((index) => !sessionPool.shownIndexes.includes(index));

  return availableIndexes.slice(0, requestedCount);
}

async function cleanSelectedProblems(
  selectedItems: Array<SessionPoolItem & { index: number }>
): Promise<CuratedProblem[]> {
  const fallback = selectedItems.map((item) => ({
    index: item.index,
    title: item.title,
    summary: trimText(item.body || item.title, 220),
    category: item.category,
    upvotes: item.upvotes,
    url: item.url,
  }));

  if (selectedItems.length === 0) {
    return fallback;
  }

  const prompt = `
You clean up discovered problem posts for a product research chatbot.

Given the JSON array below, return ONLY a JSON array with one object per input item in the same order.
Each object must have this exact shape:
{
  "index": number,
  "title": "clean concise problem title under 100 characters",
  "summary": "2-3 sentence objective summary of the problem",
  "category": "original category",
  "upvotes": number,
  "url": "original url"
}

Rules:
- Keep the same index, category, upvotes, and url values from the input.
- Summaries must describe the problem, not the person.
- Be concise and concrete.
- Do not invent details not present in the input.

Input:
${JSON.stringify(selectedItems)}
  `.trim();

  try {
    const response = await callAI(prompt);
    const cleaned = response.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned) as CuratedProblem[];

    if (
      Array.isArray(parsed) &&
      parsed.length === selectedItems.length &&
      parsed.every(
        (item) =>
          typeof item.index === "number" &&
          typeof item.title === "string" &&
          typeof item.summary === "string"
      )
    ) {
      return parsed.map((item, index) => ({
        index: item.index,
        title: item.title || fallback[index].title,
        summary: item.summary || fallback[index].summary,
        category: item.category || fallback[index].category,
        upvotes: item.upvotes || fallback[index].upvotes,
        url: item.url || fallback[index].url,
      }));
    }
  } catch (_error) {
    // Fall back to deterministic cleanup if the AI formatter fails.
  }

  return fallback;
}

export async function buildSessionPool(
  sessionId: string,
  query: string
): Promise<DiscoveryPipelineResult> {
  const parsed = await parseQuery(query);
  const existingPool = getSessionPool(sessionId);

  if (existingPool && existingPool.category === parsed.category) {
    return {
      category: existingPool.category,
      matchedKeywords: existingPool.matchedKeywords,
      subreddits: existingPool.subreddits,
      candidates: [],
      pipeline: {
        fetched: 0,
        afterFilter: 0,
        afterClassification: 0,
        saved: 0,
        duplicates: 0,
        total: existingPool.items.length,
      },
      problems: await getProblemsByCategory(existingPool.category, 40),
    };
  }

  const storedProblems = await getProblemsByCategory(parsed.category, 40);

  if (storedProblems.length > 0) {
    saveSessionPool(sessionId, {
      query,
      category: parsed.category,
      matchedKeywords: parsed.matchedKeywords,
      subreddits: parsed.subreddits,
      items: toSessionPoolItemsFromStoredProblems(storedProblems),
      shownIndexes: [],
      lastPresentedIndexes: [],
    });

    return {
      category: parsed.category,
      matchedKeywords: parsed.matchedKeywords,
      subreddits: parsed.subreddits,
      candidates: [],
      pipeline: {
        fetched: 0,
        afterFilter: 0,
        afterClassification: 0,
        saved: 0,
        duplicates: 0,
        total: storedProblems.length,
      },
      problems: storedProblems,
    };
  }

  const discovery = await runDiscoveryPipeline(query);
  const sessionPool: SessionPoolState = {
    query,
    category: discovery.category,
    matchedKeywords: discovery.matchedKeywords,
    subreddits: discovery.subreddits,
    items: toSessionPoolItems(discovery.candidates),
    shownIndexes: [],
    lastPresentedIndexes: [],
  };

  saveSessionPool(sessionId, sessionPool);
  return discovery;
}

export async function getCuratedProblemsForSession(
  sessionId: string,
  userMessage: string
): Promise<{
  sessionPool: SessionPoolState;
  curatedProblems: CuratedProblem[];
}> {
  const sessionPool = getSessionPool(sessionId);

  if (!sessionPool) {
    throw new Error("No discovered pool found for this session");
  }

  const requestedCount = extractRequestedCount(userMessage) || DEFAULT_RESULT_COUNT;
  const nextIndexes = getNextPoolIndexes(sessionPool, requestedCount);
  const selectedItems = nextIndexes.map((index) => ({
    ...sessionPool.items[index],
    index,
  }));
  const curatedProblems = await cleanSelectedProblems(selectedItems);

  sessionPool.shownIndexes.push(...nextIndexes);
  sessionPool.lastPresentedIndexes = nextIndexes;

  return {
    sessionPool,
    curatedProblems,
  };
}

export async function runDiscoveryPipeline(
  query: string
): Promise<DiscoveryPipelineResult> {
  const parsed = await parseQuery(query);

  // Legacy behavior note:
  // The discovery pipeline used to fetch from Reddit immediately for every
  // discovery request. We now let buildSessionPool() do a DB-first category
  // check and only call this function when the requested category is not
  // already available in storage for reuse.
  const rawPosts = await fetchPosts(parsed.subreddits.map(s => s.name));

  if (rawPosts.length === 0) {
    return {
      category: parsed.category,
      matchedKeywords: parsed.matchedKeywords,
      subreddits: parsed.subreddits,
      candidates: [],
      pipeline: {
        fetched: 0,
        afterFilter: 0,
        afterClassification: 0,
        saved: 0,
        duplicates: 0,
        total: 0,
      },
      problems: await getProblemsByCategory(parsed.category, 10),
    };
  }

  const filteredPosts = filterPosts(rawPosts);

  if (filteredPosts.length === 0) {
    return {
      category: parsed.category,
      matchedKeywords: parsed.matchedKeywords,
      subreddits: parsed.subreddits,
      candidates: [],
      pipeline: {
        fetched: rawPosts.length,
        afterFilter: 0,
        afterClassification: 0,
        saved: 0,
        duplicates: 0,
        total: 0,
      },
      problems: await getProblemsByCategory(parsed.category, 10),
    };
  }

  const classifiedPosts = classifyPosts(filteredPosts, parsed);
  const urlBackedClassifiedPosts = classifiedPosts.filter((post) =>
    hasUsableUrl(post.url)
  );
  const { saved, duplicates, total } = await storePosts(urlBackedClassifiedPosts);

  return {
    category: parsed.category,
    matchedKeywords: parsed.matchedKeywords,
    subreddits: parsed.subreddits,
    candidates: urlBackedClassifiedPosts,
    pipeline: {
      fetched: rawPosts.length,
      afterFilter: filteredPosts.length,
      afterClassification: urlBackedClassifiedPosts.length,
      saved,
      duplicates,
      total,
    },
    problems: await getProblemsByCategory(parsed.category, 10),
  };
}
