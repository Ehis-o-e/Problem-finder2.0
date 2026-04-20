import prisma from "../config/database.config";
import { callAI } from "../config/ai.config";
import { ClassifiedPost } from "../classifier.module/classifier.service";
import type { SubredditResult } from "../queryParser.module/queryParser.service";

const MAX_AI_SUMMARIES_PER_RUN = 3;
const FALLBACK_SUMMARY_LENGTH = 220;

function buildFallbackSummary(post: ClassifiedPost): {
  title: string;
  summary: string;
} {
  const compactBody = post.body.replace(/\s+/g, " ").trim();
  const rawSummary = compactBody || post.title;
  const summary =
    rawSummary.length <= FALLBACK_SUMMARY_LENGTH
      ? rawSummary
      : `${rawSummary.slice(0, FALLBACK_SUMMARY_LENGTH).trim()}...`;

  return {
    title: post.title.trim(),
    summary,
  };
}

async function cleanAndSummariseWithAI(
  post: ClassifiedPost
): Promise<{ title: string; summary: string }> {
  const sourceSummary = post.body.slice(0, 1000);

  const prompt = `
    You are a problem extraction assistant for a constructive problem-solver tool.

First, classify the post into ONE of three categories:

CATEGORY 1 - NORMAL PROBLEM:
The author is describing a typical, everyday personal struggle they want help with.

CATEGORY 2 - DEEP STRUGGLE (STILL A PROBLEM):
The author expresses self-hate, trauma disclosure, or severe emotional pain. This IS a problem, just a deeper one. Frame it compassionately.

CATEGORY 3 - VENTING ABOUT OTHERS/SOCIETY:
The author is ranting about other people's behavior or general societal annoyances. Not a personal problem to solve.

Return ONLY a JSON object with this exact structure:

{
  "category": "normal" | "deep-struggle" | "venting",
  "title": "clean problem title under 100 characters",
  "summary": "2-3 sentence objective description of the issue"
}

IMPORTANT RULE FOR SUMMARIES:
Write summaries in THIRD-PERSON OBJECTIVE style. Describe the PROBLEM, not the PERSON.
- NEVER use: "This person..." "They..." "He..." "She..."
- NEVER narrate about the individual
- INSTEAD: State the problem as a neutral, stand-alone issue

Examples:

WRONG: "This person struggles with impulsive spending. They want to build better habits."
RIGHT: "Difficulty controlling impulse spending and establishing consistent savings habits. Previous attempts at budgeting have not stuck."

WRONG: "This person is experiencing intense feelings of self-loathing. They are caught in a cycle of harsh self-criticism."
RIGHT: "Persistent negative self-perception and harsh internal criticism. A pattern of self-devaluing thoughts that feels difficult to break."

WRONG: "This person is frustrated that their roommate doesn't wash dishes. They're seeking a diplomatic approach."
RIGHT: "Ongoing tension with a roommate over shared cleaning responsibilities. Uncertainty about how to address the issue without escalating conflict."

WRONG: "This person is carrying pain from childhood abuse and is trying to heal."
RIGHT: "Unresolved trauma from childhood experiences affecting present-day wellbeing. Difficulty knowing where or how to begin the healing process."

If "venting":
{
  "category": "venting",
  "title": "brief description of rant topic",
  "summary": "Venting about external behavior, not a personal problem seeking resolution."
}

Title: ${post.title}
Summary: ${sourceSummary}
`.trim();

  try {
    const response = await callAI(prompt);
    const cleaned = response.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    return {
      title: parsed.title || post.title,
      summary: parsed.summary || buildFallbackSummary(post).summary,
    };
  } catch (_error) {
    return buildFallbackSummary(post);
  }
}

async function isDuplicate(post: ClassifiedPost): Promise<boolean> {
  const existingById = await prisma.problem.findUnique({
    where: { redditPostId: post.redditPostId },
  });

  if (existingById) {
    return true;
  }

  const recentProblems = await prisma.problem.findMany({
    select: { title: true },
    where: {
      expiresAt: { gt: new Date() },
    },
  });

  for (const existing of recentProblems) {
    const similarity = jaccardSimilarity(
      post.title.toLowerCase(),
      existing.title.toLowerCase()
    );

    if (similarity >= 0.8) {
      await prisma.problem.updateMany({
        where: { title: existing.title },
        data:
          post.upvotes >
          (
            await prisma.problem.findFirst({
              where: { title: existing.title },
              select: { upvotes: true },
            })
          )!.upvotes
            ? { upvotes: post.upvotes }
            : {},
      });

      return true;
    }
  }

  return false;
}

function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a.split(" "));
  const setB = new Set(b.split(" "));

  const intersection = new Set([...setA].filter((word) => setB.has(word)));
  const union = new Set([...setA, ...setB]);

  return intersection.size / union.size;
}

export async function purgeExpiredProblems(): Promise<void> {
  const deleted = await prisma.problem.deleteMany({
    where: {
      expiresAt: { lt: new Date() },
    },
  });

  console.log(`Purged ${deleted.count} expired problems`);
}

async function savePost(
  post: ClassifiedPost,
  options?: {
    useAI?: boolean;
  }
): Promise<void> {
  const { title, summary } =
    options?.useAI === false
      ? buildFallbackSummary(post)
      : await cleanAndSummariseWithAI(post);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  await prisma.problem.create({
    data: {
      title,
      summary,
      category: post.category,
      confidenceScore: post.confidenceScore,
      source: "reddit",
      sourceUrl: post.url,
      url: post.url,
      redditPostId: post.redditPostId,
      upvotes: post.upvotes,
      commentCount: post.commentCount,
      expiresAt,
    },
  });

  console.log(`Saved: ${title}`);
}

export async function storePosts(posts: ClassifiedPost[]): Promise<{
  saved: number;
  duplicates: number;
  total: number;
}> {
  await purgeExpiredProblems();

  let saved = 0;
  let duplicates = 0;
  let aiSummariesUsed = 0;

  const prioritisedPosts = [...posts].sort((a, b) => b.upvotes - a.upvotes);

  for (const post of prioritisedPosts) {
    const duplicate = await isDuplicate(post);

    if (duplicate) {
      duplicates++;
      continue;
    }

    const useAI = aiSummariesUsed < MAX_AI_SUMMARIES_PER_RUN;
    await savePost(post, { useAI });

    if (useAI) {
      aiSummariesUsed++;
    }

    saved++;
  }

  return {
    saved,
    duplicates,
    total: posts.length,
  };
}

export interface StoredProblem {
  id: string;
  title: string;
  summary: string | null;
  category: string;
  confidenceScore: number | null;
  upvotes: number;
  url: string | null;
}

export interface SessionPoolItem {
  id: string;
  title: string;
  body: string;
  category: string;
  confidenceScore: number;
  upvotes: number;
  commentCount: number;
  url: string;
  redditPostId: string;
}

export interface SessionPoolState {
  query: string;
  category: string;
  matchedKeywords: string[];
  subreddits: SubredditResult[];
  items: SessionPoolItem[];
  shownIndexes: number[];
  lastPresentedIndexes: number[];
}

const SESSION_POOLS = new Map<string, SessionPoolState>();

export function saveSessionPool(
  sessionId: string,
  sessionPool: SessionPoolState
): void {
  SESSION_POOLS.set(sessionId, sessionPool);
}

export function getSessionPool(
  sessionId: string
): SessionPoolState | undefined {
  return SESSION_POOLS.get(sessionId);
}

export async function getProblemsByCategory(
  category: string,
  limit = 40
): Promise<StoredProblem[]> {
  const now = new Date();

  const problems = await prisma.problem.findMany({
    where: {
      ...(category === "General" ? {} : { category }),
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: [{ upvotes: "desc" }, { createdAt: "desc" }],
    take: limit,
    select: {
      id: true,
      title: true,
      summary: true,
      category: true,
      confidenceScore: true,
      upvotes: true,
      url: true,
    },
  });

  return problems;
}
