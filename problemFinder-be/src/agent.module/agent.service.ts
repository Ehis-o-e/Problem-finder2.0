import prisma from "../config/database.config";
import { callAI } from "../config/ai.config";
import { ClassifiedPost } from "../classifier.module/classifier.service";
import {
  CuratedProblem,
} from "../discover.module/discover.service";
import { SessionPoolState } from "../storage.module/storage.service";

//System prompt that defines ai job
const SYSTEM_PROMPT = `
You are a problem exploration assistant. Your job is to help users deeply understand real-world problems that people face.

You have access to a pool of real problems discovered from Reddit. Use these problems as your knowledge base.

Your role is to:
- Help users understand why a problem exists
- Break down who is affected and how
- Explore what solutions currently exist and why they fall short
- Help users refine their thinking about the problem
- Suggest angles they may not have considered

Be conversational, insightful and concise. Never make up problems — only reference what you have been given.
If the user asks about something outside the provided problems, gently redirect them back to the problem context.
`.trim();

// ── Preprocessing (Pipeline Job) ─────────────────────────────────────────────

export async function cleanAndSummarise(
  post: ClassifiedPost
): Promise<{ title: string; summary: string }> {
  const prompt = `
You are a problem extraction assistant.
Given a Reddit post, extract the core problem being described.

Return ONLY a JSON object in this exact format with no extra text:
{
  "title": "a clean, concise problem title under 100 characters",
  "summary": "a 2-3 sentence summary of the core problem being described"
}

Reddit post title: ${post.title}
Reddit post body: ${post.body.slice(0, 1000)}
  `.trim();

  try {
    const response = await callAI(prompt);
    const cleaned = response.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    return {
      title: parsed.title || post.title,
      summary: parsed.summary || post.body.slice(0, 200),
    };
  } catch (error) {
    return {
      title: post.title,
      summary: post.body.slice(0, 200),
    };
  }
}

// ── Session Management ────────────────────────────────────────────────────────

export async function createSession(
  userId?: string,
  problemId?: string
): Promise<string> {
  const session = await prisma.chatSession.create({
    data: {
      userId: userId ?? null,
      problemId: problemId ?? null,
    },
  });

  return session.id;
}

export async function getSessionWithHistory(sessionId: string) {
  const session = await prisma.chatSession.findUnique({
    where: { id: sessionId },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
      },
      problem: true,
    },
  });

  return session;
}

// ── Context Builder ───────────────────────────────────────────────────────────

async function buildContext(problemId?: string): Promise<string> {
  if (!problemId) {
    // General chat — pull top 20 problems across all categories
    const problems = await prisma.problem.findMany({
      take: 20,
      orderBy: { upvotes: "desc" },
      where: { expiresAt: { gt: new Date() } },
      select: {
        title: true,
        summary: true,
        category: true,
        upvotes: true,
      },
    });

    return `
Here are some real problems people are facing:
${problems.map((p, i) => `
${i + 1}. [${p.category}] ${p.title}
   ${p.summary}
`).join("")}
    `.trim();
  }

  // Problem-specific chat — pull the problem + related problems in same category
  const problem = await prisma.problem.findUnique({
    where: { id: problemId },
  });

  if (!problem) return "";

  const relatedProblems = await prisma.problem.findMany({
    where: {
      category: problem.category,
      id: { not: problemId },
      expiresAt: { gt: new Date() },
    },
    orderBy: { upvotes: "desc" },
    take: 10,
    select: {
      title: true,
      summary: true,
      upvotes: true,
    },
  });

  return `
Primary problem being explored:
Title: ${problem.title}
Summary: ${problem.summary}
Category: ${problem.category}
Upvotes: ${problem.upvotes}

Related problems in the same category:
${relatedProblems.map((p, i) => `
${i + 1}. ${p.title}
   ${p.summary}
`).join("")}
  `.trim();
}

export function buildCuratedProblemsContext(
  sessionPool: SessionPoolState,
  curatedProblems: CuratedProblem[]
): string {
  return `
You are helping the user explore real-world problems from a discovered session pool.
Current topic: ${sessionPool.query}
Category: ${sessionPool.category}
Matched keywords: ${
    sessionPool.matchedKeywords.length > 0
      ? sessionPool.matchedKeywords.join(", ")
      : "none"
  }

Present the curated problems clearly. Mention their numbering so the user can refer to "the first one", "the second one", and so on.

Problems to present:
${curatedProblems
  .map(
    (problem) => `
${problem.index + 1}. [${problem.category}] ${problem.title}
Summary: ${problem.summary}
Upvotes: ${problem.upvotes}
URL: ${problem.url}
`
  )
  .join("\n")}
  `.trim();
}

export function buildSessionPoolDiscussionContext(
  sessionPool: SessionPoolState
): string {
  const referenceIndexes =
    sessionPool.lastPresentedIndexes.length > 0
      ? sessionPool.lastPresentedIndexes
      : sessionPool.shownIndexes;

  const shownItems = referenceIndexes.map((index) => {
    const item = sessionPool.items[index];
    return {
      index: index + 1,
      title: item.title,
      body: item.body,
      category: item.category,
      upvotes: item.upvotes,
      commentCount: item.commentCount,
      url: item.url,
    };
  });

  const fallbackItems =
    shownItems.length > 0
      ? shownItems
      : sessionPool.items.slice(0, 5).map((item, index) => ({
          index: index + 1,
          title: item.title,
          body: item.body,
          category: item.category,
          upvotes: item.upvotes,
          commentCount: item.commentCount,
          url: item.url,
        }));

  return `
You are discussing problems from the user's current discovered pool.
Current topic: ${sessionPool.query}
Category: ${sessionPool.category}

Use the structured list below as the source of truth.
If the user refers to a numbered problem like "the first one" or "the second problem", you must discuss that exact numbered item from the last presented list.
Do not swap in a different problem, do not re-rank the list, and do not replace an item because it seems more relevant.
Only ask for clarification if there is no numbered list available.

Session pool:
${JSON.stringify(fallbackItems, null, 2)}
  `.trim();
}

// ── Chat ──────────────────────────────────────────────────────────────────────

export async function chat(
  sessionId: string,
  userMessage: string,
  options?: {
    contextOverride?: string;
  }
): Promise<string> {
  const session = await getSessionWithHistory(sessionId);

  if (!session) {
    throw new Error("Session not found");
  }

  // Save user message to DB
  await prisma.chatMessage.create({
    data: {
      sessionId,
      role: "user",
      content: userMessage,
    },
  });

  // Build context from DB
  const context =
    options?.contextOverride ??
    (await buildContext(session.problemId ?? undefined));

  // Build conversation history for AI
  const history = session.messages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  // Build full prompt
  const messages = [
    {
      role: "system" as const,
      content: `${SYSTEM_PROMPT}\n\n${context}`,
    },
    ...history,
    {
      role: "user" as const,
      content: userMessage,
    },
  ];

  // Call AI
  const response = await callAI(messages);

  // Save assistant response to DB
  await prisma.chatMessage.create({
    data: {
      sessionId,
      role: "assistant",
      content: response,
    },
  });

  return response;
}

// ── Get Session History ───────────────────────────────────────────────────────

export async function getHistory(sessionId: string) {
  const messages = await prisma.chatMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: "asc" },
    select: {
      role: true,
      content: true,
      createdAt: true,
    },
  });

  return messages;
}
