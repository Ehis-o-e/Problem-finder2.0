import prisma from "../config/database.config";
import { callAI } from "../config/ai.config";
import { CuratedProblem } from "../discover.module/discover.service";
import {
  SessionPoolItem,
  SessionPoolState,
} from "../storage.module/storage.service";

const SYSTEM_PROMPT = `
You are a problem exploration assistant. Your job is to help users deeply understand real-world problems that people face.

You have access to a pool of real problems discovered from Reddit. Use these problems as your knowledge base.

Your role is to:
- Help users understand why a problem exists
- Break down who is affected and how
- Explore what solutions currently exist and why they fall short
- Help users refine their thinking about the problem
- Suggest angles they may not have considered

Be conversational, insightful and concise. Never make up problems - only reference what you have been given.
If the user asks about something outside the provided problems, gently redirect them back to the problem context.
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

/**
 * Uses the AI to determine whether the user is referring to one specific
 * displayed problem, and if so, which one from the last displayed list.
 */
export async function extractDisplayedProblemReference(
  userMessage: string,
  sessionPool: SessionPoolState
): Promise<{
  displayIndex: number | null;
  refersToSpecificProblem: boolean;
}> {
  const { displayedProblems } = getDisplayedProblems(sessionPool);

  if (displayedProblems.length === 0) {
    return {
      displayIndex: null,
      refersToSpecificProblem: false,
    };
  }

  try {
    const response = await callAI([
      {
        role: "system",
        content: `You resolve which numbered problem a user is referring to from a displayed list.

You will be given:
- a numbered list of problems the user most recently saw
- the user's follow-up message

Return ONLY valid JSON in this exact format:
{"displayIndex": number | null, "refersToSpecificProblem": boolean}

Rules:
- Use ONLY the displayed list you are given.
- If the user refers to one specific displayed problem, return its displayIndex and set "refersToSpecificProblem" to true.
- If the user is clearly trying to talk about one specific displayed problem but you cannot safely identify which one, return {"displayIndex": null, "refersToSpecificProblem": true}.
- Handle natural language, shorthand, and minor typos.
- If the user is not referring to one specific displayed problem, return {"displayIndex": null, "refersToSpecificProblem": false}.
- Do not explain your answer.`,
      },
      {
        role: "user",
        content: `Displayed problems:
${JSON.stringify(displayedProblems, null, 2)}

User message:
${userMessage}`,
      },
    ]);

    const cleaned = response.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned) as {
      displayIndex?: number | null;
      refersToSpecificProblem?: boolean;
    };

    if (
      typeof parsed.displayIndex === "number" &&
      parsed.displayIndex >= 1 &&
      parsed.displayIndex <= displayedProblems.length
    ) {
      return {
        displayIndex: parsed.displayIndex,
        refersToSpecificProblem: true,
      };
    }

    if (parsed.refersToSpecificProblem === true) {
      return {
        displayIndex: null,
        refersToSpecificProblem: true,
      };
    }
  } catch (_error) {
    // Fall through to a neutral unresolved state.
  }

  return {
    displayIndex: null,
    refersToSpecificProblem: false,
  };
}

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
Matched keywords: ${
    sessionPool.matchedKeywords.length > 0
      ? sessionPool.matchedKeywords.join(", ")
      : "none"
  }

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

/**
 * Builds context for a single focused problem the user selected.
 * Only injects that one problem — no list — so the AI cannot pick a different one.
 */
export function buildFocusedSessionProblemContext(
  sessionPool: SessionPoolState,
  displayIndex: number
): string | null {
  const { referenceIndexes, displayedProblems } = getDisplayedProblems(sessionPool);

  if (referenceIndexes.length === 0) return null;

  const selectedPoolIndex = referenceIndexes[displayIndex - 1];
  const selectedItem = sessionPool.items[selectedPoolIndex];

  if (!selectedItem) return null;

  const focusedProblem = toDisplayedProblem(
    selectedItem,
    displayIndex - 1,
    selectedPoolIndex
  );

  return `
You are discussing problems from the user's current session pool.
Current topic: ${sessionPool.query}
Category: ${sessionPool.category}

The user is currently asking about problem #${displayIndex}. This is your primary focus.
Answer questions about this problem specifically. Do not swap it out or replace it with another problem from the list.
You may reference other problems from the list only if the user explicitly asks to compare or go back to them.

FOCUSED problem (what the user is asking about right now):
${JSON.stringify(focusedProblem, null, 2)}

Full list for conversational context (use only when the user explicitly references another item):
${JSON.stringify(displayedProblems, null, 2)}
  `.trim();
}

export function buildSessionPoolDiscussionContext(
  sessionPool: SessionPoolState
): string {
  const { displayedProblems } = getDisplayedProblems(sessionPool);

  const fallbackItems =
    displayedProblems.length > 0
      ? displayedProblems
      : sessionPool.items
          .slice(0, 5)
          .map((item, index) => toDisplayedProblem(item, index, index));

  return `
You are discussing problems from the user's current discovered pool.
Current topic: ${sessionPool.query}
Category: ${sessionPool.category}

Use the structured list below as the source of truth.
If the user refers to a numbered problem like "the first one" or "the second problem", you must discuss that exact numbered item from the last presented list.
The property "displayIndex" is the number the user saw in the chat. Use that number, not "originalIndex".
Do not swap in a different problem, do not re-rank the list, and do not replace an item because it seems more relevant.
Only ask for clarification if there is no numbered list available.

Session pool:
${JSON.stringify(fallbackItems, null, 2)}
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
    historyMode?: "full" | "user-only" | "none";
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
  const history =
    historyMode === "none"
      ? []
      : session.messages
          .filter((message) =>
            historyMode === "user-only" ? message.role === "user" : true
          )
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
