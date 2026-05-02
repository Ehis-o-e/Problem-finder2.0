import prisma from "../config/database.config";
import { callAI } from "../config/ai.config";
import { ClassifiedPost } from "../classifier.module/classifier.service";
import type { SubredditResult } from "../queryParser.module/queryParser.service";

const MAX_AI_SUMMARIES_PER_RUN = 3;
const FALLBACK_SUMMARY_LENGTH = 220;

type SummaryCategory = "normal" | "deep-struggle" | "venting" | "off-topic";

// ─── Fallback ─────────────────────────────────────────────────────────────────

function buildFallbackSummary(post: ClassifiedPost): {
  category: SummaryCategory;
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
    category: "normal",
    title: post.title.trim(),
    summary,
  };
}

// ─── AI Summariser ────────────────────────────────────────────────────────────

async function cleanAndSummariseWithAI(
  post: ClassifiedPost
): Promise<{ category: SummaryCategory; title: string; summary: string }> {
  const sourceSummary = post.body.slice(0, 1000);

  const prompt = `
You are a problem extraction assistant for a product research tool.
Your job is to turn raw Reddit posts into clean, useful problem descriptions.

First classify the post into ONE of four categories:

CATEGORY 1 - NORMAL PROBLEM:
A personal or professional struggle the author wants help with or is dealing with.

CATEGORY 2 - DEEP STRUGGLE:
The author expresses trauma, self-hate, or severe emotional pain.
Still a real and valid problem — frame it with care.

CATEGORY 3 - VENTING:
The author is frustrated about other people, institutions, or systems.
This IS a real problem — reframe it as the underlying issue, not the rant.
Example: ranting about a landlord ignoring repairs -> "Getting landlords to respond to maintenance requests"

CATEGORY 4 - OFF TOPIC:
A showcase, photo, appreciation post, news article, or general discussion
where no problem is being described at all. Skip these.

Return ONLY a JSON object:
{
  "category": "normal" | "deep-struggle" | "venting" | "off-topic",
  "title": "clear problem title under 100 characters",
  "summary": "2-3 sentences describing the problem clearly and naturally"
}

SUMMARY RULES:
- Write like a smart, empathetic researcher summarising a real problem
- Describe the situation and what makes it difficult
- Do not narrate about the person — focus on the problem itself
- Be concrete and specific, not clinical or robotic
- For off-topic posts set summary to "Not a problem post"

Good summary examples:
- "Keeping track of client invoices manually takes hours each week and errors are easy to miss."
- "Getting a consistent sleep schedule is hard when work hours keep shifting unpredictably."
- "Landlords in many cities ignore maintenance requests for months with no legal consequence."
- "Transitioning from freelance to full-time employment means losing tax deductions with no clear guidance."

Bad summary examples:
- "Persistent negative self-perception and harsh internal criticism." (too clinical)
- "This person struggles with invoicing." (narrating about the person)
- "Difficulty controlling impulse spending." (too stiff, reads like a diagnosis)

Title: ${post.title}
Body: ${sourceSummary}
  `.trim();

  try {
    const response = await callAI(prompt);
    const cleaned = response.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned) as {
      category?: SummaryCategory;
      title?: string;
      summary?: string;
    };

    return {
      category:
        parsed.category === "deep-struggle" ||
        parsed.category === "venting" ||
        parsed.category === "off-topic"
          ? parsed.category
          : "normal",
      title: parsed.title || post.title,
      summary: parsed.summary || buildFallbackSummary(post).summary,
    };
  } catch (_error) {
    return buildFallbackSummary(post);
  }
}

// ─── Duplicate Check ──────────────────────────────────────────────────────────

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

// ─── Save ─────────────────────────────────────────────────────────────────────

async function savePost(
  post: ClassifiedPost,
  options?: { useAI?: boolean }
): Promise<{
  saved: boolean;
  skippedReason?: "off-topic" | "invalid";
}> {
  if (!post.url || post.url.trim().length === 0) {
    return { saved: false, skippedReason: "invalid" };
  }

  const { category, title, summary } =
    options?.useAI === false
      ? buildFallbackSummary(post)
      : await cleanAndSummariseWithAI(post);

  if (category === "off-topic") {
    console.log(`Skipped off-topic post: ${post.title}`);
    return { saved: false, skippedReason: "off-topic" };
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  try {
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
    return { saved: true };
  } catch (error) {
    console.error("Skipping malformed or invalid problem record", {
      redditPostId: post.redditPostId,
      titlePreview: post.title.slice(0, 120),
      url: post.url,
      error,
    });
    return { saved: false, skippedReason: "invalid" };
  }
}

// ─── Purge ────────────────────────────────────────────────────────────────────

export async function purgeExpiredProblems(): Promise<void> {
  const deleted = await prisma.problem.deleteMany({
    where: {
      expiresAt: { lt: new Date() },
    },
  });

  console.log(`Purged ${deleted.count} expired problems`);
}

// ─── Store ────────────────────────────────────────────────────────────────────

export async function storePosts(posts: ClassifiedPost[]): Promise<{
  saved: number;
  duplicates: number;
  total: number;
}> {
  await purgeExpiredProblems();

  const urlBackedPosts = posts.filter(
    (post) => post.url && post.url.trim().length > 0
  );

  let saved = 0;
  let duplicates = 0;
  let skippedInvalid = 0;
  let skippedOffTopic = 0;
  let aiSummariesUsed = 0;

  const prioritisedPosts = [...urlBackedPosts].sort(
    (a, b) => b.upvotes - a.upvotes
  );

  for (const post of prioritisedPosts) {
    const duplicate = await isDuplicate(post);

    if (duplicate) {
      duplicates++;
      continue;
    }

    const useAI = aiSummariesUsed < MAX_AI_SUMMARIES_PER_RUN;
    const saveResult = await savePost(post, { useAI });

    if (!saveResult.saved) {
      if (saveResult.skippedReason === "off-topic") {
        skippedOffTopic++;
      } else {
        skippedInvalid++;
      }
      continue;
    }

    if (useAI) {
      aiSummariesUsed++;
    }

    saved++;
  }

  if (skippedOffTopic > 0) {
    console.warn(`Skipped ${skippedOffTopic} off-topic post(s) during storage`);
  }

  if (skippedInvalid > 0) {
    console.warn(
      `Skipped ${skippedInvalid} malformed or invalid problem record(s) during storage`
    );
  }

  return {
    saved,
    duplicates,
    total: urlBackedPosts.length,
  };
}

// ─── Types ────────────────────────────────────────────────────────────────────

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
  subreddits: SubredditResult[];
  items: SessionPoolItem[];
  shownIndexes: number[];
  lastPresentedIndexes: number[];
}

// ─── Session Pool ─────────────────────────────────────────────────────────────

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

// ─── Query ────────────────────────────────────────────────────────────────────

export async function getProblemsByCategory(
  category: string,
  limit = 40
): Promise<StoredProblem[]> {
  const now = new Date();

  const problems = await prisma.problem.findMany({
    where: {
      ...(category === "General" ? {} : { category }),
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      NOT: [{ url: null }, { url: "" }],
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