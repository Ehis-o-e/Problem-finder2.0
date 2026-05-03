import prisma from "../config/database.config";
import { callAI } from "../config/ai.config";
import { CuratedProblem } from "../discover.module/discover.service";
import {
  SessionPoolItem,
  SessionPoolState,
} from "../storage.module/storage.service";

const MAX_DISCUSSION_BODY_LENGTH = 240;
const MAX_REMAINING_ITEMS_IN_CONTEXT = 8;
const MAX_HISTORY_MESSAGES = 6;

const SYSTEM_PROMPT = 
`You are a problem exploration assistant helping users understand real-world problems 
surfaced from Reddit discussions.

You have been given a pool of discovered problems. This is your only knowledge base — 
never invent or reference problems outside of it.

Your role:
- Help the user understand why a problem exists and who it affects
- Break down current solutions and why they fall short, and suggest what a better approach could look like
- Propose concrete ways the user could solve or address the problem themselves
- Suggest angles or dimensions the user may not have considered
- Ask follow-up questions to deepen their thinking when relevant

Tone: Direct and analytical. Skip filler phrases. Get to the insight quickly.

When the user references a problem that is not in the provided list:
- Tell them it is not in the current set and ask if they want to search for it as a new topic.

When the user goes off-topic:
- Briefly acknowledge, then redirect: "That's outside the current problem set — 
  want me to stick to what we have, or should we search for problems in that area?"
`.trim();

// ─────────────────────────────────────────────
// Session
// ─────────────────────────────────────────────

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
  return prisma.chatSession.findUnique({
    where: { id: sessionId },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      problem: true,
    },
  });
}

export async function getHistory(sessionId: string) {
  return prisma.chatMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: "asc" },
    select: {
      role: true,
      content: true,
      createdAt: true,
    },
  });
}

export async function saveMessage(
  sessionId: string,
  role: "user" | "assistant",
  content: string
) {
  return prisma.chatMessage.create({
    data: {
      sessionId,
      role,
      content,
    },
  });
}

function toDisplayedProblem(
  item: SessionPoolItem,
  displayIndex: number,
  originalIndex: number
) {
  return {
    displayIndex: displayIndex + 1,
    originalIndex: originalIndex + 1,
    title: item.title,
    body: item.body,
    category: item.category,
    upvotes: item.upvotes,
    commentCount: item.commentCount,
    url: item.url,
  };
}

function compactText(value: string, maxLength: number): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length <= maxLength
    ? compact
    : `${compact.slice(0, maxLength).trim()}...`;
}

function getDisplayedProblems(sessionPool: SessionPoolState) {
  const referenceIndexes =
    sessionPool.lastPresentedIndexes.length > 0
      ? sessionPool.lastPresentedIndexes
      : sessionPool.shownIndexes;

  return {
    referenceIndexes,
    displayedProblems: referenceIndexes.map((index, displayIndex) =>
      toDisplayedProblem(sessionPool.items[index], displayIndex, index)
    ),
  };
}

// ─────────────────────────────────────────────
// Reference extraction — replaces ORDINAL_ALIASES
// ─────────────────────────────────────────────


// ─────────────────────────────────────────────
// Context builders
// ─────────────────────────────────────────────

async function buildContext(problemId?: string): Promise<string> {
  if (!problemId) {
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
${problems
  .map(
    (problem, index) => `
${index + 1}. [${problem.category}] ${problem.title}
   ${problem.summary}
`
  )
  .join("")}
    `.trim();
  }

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
${relatedProblems
  .map(
    (relatedProblem, index) => `
${index + 1}. ${relatedProblem.title}
   ${relatedProblem.summary}
`
  )
  .join("")}
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


Present the curated problems clearly. Mention their numbering so the user can refer to "the first one", "the second one", and so on.

Problems to present:
${curatedProblems
  .map(
    (problem, displayIndex) => `
${displayIndex + 1}. [${problem.category}] ${problem.title}
Summary: ${problem.summary}
Upvotes: ${problem.upvotes}
URL: ${problem.url}
`
  )
  .join("\n")}
  `.trim();
}

export function formatCuratedProblemsResponse(
  sessionPool: SessionPoolState,
  curatedProblems: CuratedProblem[],
  options?: {
    isAdditionalBatch?: boolean;
  }
): string {
  const topicLabel = sessionPool.query.trim() || sessionPool.category;

  if (curatedProblems.length === 0) {
    return options?.isAdditionalBatch
      ? `I couldn't find any more problems with usable discussion links for "${topicLabel}" right now.`
      : `I couldn't find any problems with usable discussion links for "${topicLabel}" right now.`;
  }

  const intro = options?.isAdditionalBatch
    ? `Here are ${curatedProblems.length} more problems related to ${topicLabel}:`
    : curatedProblems.length === 1
      ? `Here's 1 problem related to ${topicLabel}:`
      : `Here are ${curatedProblems.length} problems related to ${topicLabel}:`;

  const formattedProblems = curatedProblems
    .map(
      (problem, displayIndex) => `${displayIndex + 1}. **${problem.title}**
${problem.summary}
${problem.upvotes} upvotes ${problem.url}`
    )
    .join("\n\n");

  const outro =
    curatedProblems.length === 1
      ? `\n\nAsk about problem 1 if you want details, or say "more" to pull in more problems.`
      : `\n\nReply with a number like "1" or "the second one" to explore one problem, or say "more" to pull in more problems.`;

  return `${intro}\n\n${formattedProblems}${outro}`;
}

export function buildSessionPoolDiscussionContext(
  sessionPool: SessionPoolState
): string {
  const { referenceIndexes, displayedProblems } = getDisplayedProblems(sessionPool);
  const trimmedDisplayedProblems = displayedProblems.map((problem) => ({
    ...problem,
    body: compactText(problem.body, MAX_DISCUSSION_BODY_LENGTH),
  }));
  const remainingItems = sessionPool.items
    .map((item, index) => ({ item, index }))
    .filter(({ index }) => !referenceIndexes.includes(index));
  const remainingSummary = remainingItems
    .slice(0, MAX_REMAINING_ITEMS_IN_CONTEXT)
    .map(({ item, index }) => ({
      sessionIndex: index + 1,
      title: item.title,
      bodyPreview: compactText(item.body, 120),
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
The property "displayIndex" is the number the user saw in the chat. Use that number, not "originalIndex".
Do not swap in a different problem, do not re-rank the list, and do not replace an item because it seems more relevant.
Only ask for clarification if there is no numbered list available.

Last displayed problems:
${trimmedDisplayedProblems.length > 0 ? JSON.stringify(trimmedDisplayedProblems, null, 2) : "none"}

Remaining undisplayed problems: ${remainingItems.length}
Remaining problem summary:
${remainingSummary.length > 0 ? JSON.stringify(remainingSummary, null, 2) : "none"}
  `.trim();
}

// ─────────────────────────────────────────────
// Chat
// ─────────────────────────────────────────────

export async function chat(
  sessionId: string,
  userMessage: string,
  options?: {
    contextOverride?: string;
    historyMode?: "full" | "user-only";
  }
): Promise<string> {
  const session = await getSessionWithHistory(sessionId);

  if (!session) {
    throw new Error("Session not found");
  }

  await prisma.chatMessage.create({
    data: {
      sessionId,
      role: "user",
      content: userMessage,
    },
  });

  const context =
    options?.contextOverride ??
    (await buildContext(session.problemId ?? undefined));

  const historyMode = options?.historyMode ?? "full";
  const history = session.messages
    .filter((message) =>
      historyMode === "user-only" ? message.role === "user" : true
    )
    .slice(-MAX_HISTORY_MESSAGES)
    .map((message) => ({
      role: message.role as "user" | "assistant",
      content: message.content,
    }));

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

  const response = await callAI(messages);

  await prisma.chatMessage.create({
    data: {
      sessionId,
      role: "assistant",
      content: response,
    },
  });

  return response;
}
