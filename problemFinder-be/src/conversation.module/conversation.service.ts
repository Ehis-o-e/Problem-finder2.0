import * as agentService from "../agent.module/agent.service";
import { callAI } from "../config/ai.config";
import {
  buildSessionPool,
  extractRequestedCount,
  getCuratedProblemsForSession,
} from "../discover.module/discover.service";
import type { SubredditResult } from "../queryParser.module/queryParser.service";
import { getSessionPool } from "../storage.module/storage.service";
import type { StoredProblem, SessionPoolItem } from "../storage.module/storage.service";

type ConversationIntent = "discovery" | "conversation" | "clarification";
type MoreIntent = "wants_more" | "out_of_range" | null;

interface IntentResult {
  intent: ConversationIntent;
  reason: string;
  focusedProblem: SessionPoolItem | null;
  moreIntent: MoreIntent;
}

interface ConversationResult {
  intent: ConversationIntent;
  reason: string;
  response: string;
  discovery?: {
    category: string;
    subreddits: SubredditResult[];
    pipeline: {
      fetched: number;
      afterFilter: number;
      afterClassification: number;
      saved: number;
      duplicates: number;
      total: number;
    };
    problems: StoredProblem[];
  };
}

function cleanMessageText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

async function normalizeUserMessageForRouting(userMessage: string): Promise<string> {
  const cleanedUserMessage = cleanMessageText(userMessage);

  if (!cleanedUserMessage) {
    return userMessage;
  }

  const prompt = `
You rewrite user chat messages into clear, proper English.

Return ONLY valid JSON in this exact shape:
{
  "normalizedMessage": "string"
}

Rules:
- Fix spelling, grammar, shorthand, and slang.
- Preserve the full meaning and intent of the message.
- Do not remove any words - only fix how they are written.
- Keep action and intent words like "give me", "show me", "find", "looking for".
- Preserve selection-style requests such as "1", "the first one", or "more" exactly as they are.

Examples:
- "gimme finance issue" -> "give me finance issues"
- "wht r the prblms in agriculture" -> "what are the problems in agriculture"
- "shw me mntl hlth stuff" -> "show me mental health stuff"
- "the first one" -> "the first one"
- "more" -> "more"

User message:
${cleanedUserMessage}
  `.trim();

  try {
    const response = await callAI(prompt);
    const cleanedResponse = response.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleanedResponse) as {
      normalizedMessage?: string;
    };
    const normalizedMessage = cleanMessageText(parsed.normalizedMessage ?? "");

    return normalizedMessage.length > 0 ? normalizedMessage : cleanedUserMessage;
  } catch (_error) {
    return cleanedUserMessage;
  }
}

async function extractTopicFromDiscoveryQuery(normalizedMessage: string): Promise<string> {
  const prompt = `
Extract only the core topic from this problem discovery request.
Remove all action words, intent words, and filler.
Return only the topic terms someone would type into a search engine.

Return ONLY valid JSON in this exact shape:
{
  "topic": "string"
}

Examples:
- "give me architectural problems" -> { "topic": "architecture" }
- "show me pain points in mental health" -> { "topic": "mental health" }
- "find issues in small business management" -> { "topic": "small business management" }
- "what are the problems in agriculture" -> { "topic": "agriculture" }
- "looking for remote work issues" -> { "topic": "remote work" }

Message:
${normalizedMessage}
  `.trim();

  try {
    const response = await callAI(prompt);
    const cleaned = response.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned) as { topic?: string };

    if (parsed.topic && parsed.topic.trim().length > 0) {
      return parsed.topic.trim();
    }
  } catch (_error) {
    // fall through to fallback
  }

  return normalizedMessage;
}

function buildIntentFallback(hasProblemContext: boolean): IntentResult {
  const intent = hasProblemContext ? "conversation" : "discovery";

  return {
    intent,
    reason: "Fallback keyword routing used because AI intent parsing failed.",
    focusedProblem: null,
    moreIntent: null,
  };
}

async function detectIntent(sessionId: string, userMessage: string): Promise<IntentResult> {
  const history = await agentService.getHistory(sessionId);
  const session = await agentService.getSessionWithHistory(sessionId);
  const sessionPool = getSessionPool(sessionId);

  if (!session) {
    throw new Error("Session not found");
  }

  const hasProblemContext =
    Boolean(session.problemId) ||
    Boolean(sessionPool && sessionPool.items.length > 0) ||
    history.length > 0;

  const recentHistory = history
    .slice(-20)
    .map((message) => `${message.role}: ${message.content}`)
    .join("\n");

  const displayedProblems = sessionPool
    ? sessionPool.lastPresentedIndexes.map((index, displayIndex) => ({
        displayIndex: displayIndex + 1,
        ...sessionPool.items[index],
      }))
    : [];

  const prompt = `
You classify incoming chat messages for a problem-discovery backend.

Choose exactly one intent:
- "discovery": the user wants to find problems for a NEW topic entirely.
- "conversation": the user is continuing discussion about the current topic - asking for more problems, focusing on a specific displayed problem, or asking for analysis.
- "clarification": the message is too vague to route confidently and context is insufficient.

Return ONLY valid JSON in this exact format:
{
  "intent": "discovery" | "conversation" | "clarification",
  "reason": "short explanation",
  "focusedProblem": { problem object from displayed list } | null,
  "moreIntent": "wants_more" | "out_of_range" | null
}

RULES:
- If there is an active session pool and the user message can reasonably refer to the current topic, prefer "conversation" over "clarification".
- When in doubt between "conversation" and "clarification", choose "conversation".
- If the user says "more", "give me more", "show me more", or asks for additional problems without naming a new topic:
  -> intent: "conversation", moreIntent: "wants_more", focusedProblem: null
- If the user references a problem number that exists in the currently displayed list:
  -> intent: "conversation", moreIntent: null, focusedProblem: <that problem object>
- If the user references a problem number that does NOT exist in the currently displayed list:
  -> intent: "conversation", moreIntent: "out_of_range", focusedProblem: null
- If the user clearly names a new topic or switches category:
  -> intent: "discovery", moreIntent: null, focusedProblem: null
- Use "clarification" only when there is genuinely not enough context to pick any of the above.
- Use "discovery" only when the user explicitly asks for problems, issues, or pain points in a different named topic or category than the current one.

Examples:
- "more" -> { "intent": "conversation", "moreIntent": "wants_more", "focusedProblem": null }
- "give me more" -> { "intent": "conversation", "moreIntent": "wants_more", "focusedProblem": null }
- "the second one" -> { "intent": "conversation", "moreIntent": null, "focusedProblem": <problem 2 from displayed list> }
- "problem 5" when only 3 problems are currently displayed -> { "intent": "conversation", "moreIntent": "out_of_range", "focusedProblem": null }
- "find problems in logistics" -> { "intent": "discovery", "moreIntent": null, "focusedProblem": null }
- "what about another topic" -> { "intent": "clarification", "moreIntent": null, "focusedProblem": null }

Session context:
- Has active problem context: ${session.problemId ? "yes" : "no"}
- Has session pool: ${sessionPool ? "yes" : "no"}
- Session pool total items: ${sessionPool?.items.length ?? 0}
- Problems already shown: ${sessionPool?.shownIndexes.length ?? 0}
- Problems in last displayed batch: ${sessionPool?.lastPresentedIndexes.length ?? 0}
- Has conversation history: ${history.length > 0 ? "yes" : "no"}

Recent history:
${recentHistory || "none"}

Currently displayed problems:
${displayedProblems.length > 0 ? JSON.stringify(displayedProblems, null, 2) : "none"}

Current user message:
${userMessage}
  `.trim();

  try {
    const response = await callAI(prompt);
    const cleaned = response.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned) as Partial<IntentResult>;

    if (
      parsed.intent === "discovery" ||
      parsed.intent === "conversation" ||
      parsed.intent === "clarification"
    ) {
      return {
        intent: parsed.intent,
        reason: parsed.reason ?? "AI intent routing completed.",
        focusedProblem: parsed.focusedProblem ?? null,
        moreIntent:
          parsed.moreIntent === "wants_more" ||
          parsed.moreIntent === "out_of_range"
            ? parsed.moreIntent
            : null,
      };
    }
  } catch (_error) {
    // Intentionally fall through to deterministic fallback.
  }

  return buildIntentFallback(hasProblemContext);
}

export async function createSession(
  userId?: string,
  problemId?: string
): Promise<string> {
  return agentService.createSession(userId, problemId);
}

export async function getHistory(sessionId: string) {
  return agentService.getHistory(sessionId);
}

export async function handleConversation(
  sessionId: string,
  userMessage: string
): Promise<ConversationResult> {
  const normalizedUserMessage = await normalizeUserMessageForRouting(userMessage);
  const intentResult = await detectIntent(sessionId, normalizedUserMessage);
  const existingPool = getSessionPool(sessionId);

  if (intentResult.intent === "discovery") {
    const discoveryQuery = await extractTopicFromDiscoveryQuery(normalizedUserMessage);
    const discovery = await buildSessionPool(sessionId, discoveryQuery);
    const { sessionPool, curatedProblems } = await getCuratedProblemsForSession(
      sessionId,
      discoveryQuery
    );

    const response = agentService.formatCuratedProblemsResponse(
      sessionPool,
      curatedProblems
    );

    await agentService.saveMessage(sessionId, "user", userMessage);
    await agentService.saveMessage(sessionId, "assistant", response);

    return {
      intent: intentResult.intent,
      reason: intentResult.reason,
      response,
      discovery,
    };
  }

  if (intentResult.intent === "clarification") {
    const response =
      `I'm not sure what you're referring to. Could you be more specific?` +
      `For example, you can say "tell me about problem 2" or ask about a topic you'd like me to find problems for.`;

    await agentService.saveMessage(sessionId, "user", userMessage);
    await agentService.saveMessage(sessionId, "assistant", response);

    return {
      intent: intentResult.intent,
      reason: intentResult.reason,
      response,
    };
  }

  if (intentResult.moreIntent === "out_of_range") {
    const displayedCount = existingPool?.lastPresentedIndexes.length ?? 0;
    const remainingCount = existingPool
      ? existingPool.items.length - existingPool.shownIndexes.length
      : 0;

    const response =
      displayedCount > 0
        ? remainingCount > 0
          ? `I've only shown ${displayedCount} problem${displayedCount === 1 ? "" : "s"} so far. If you want, I can pull more from this same topic.`
          : `I've only shown ${displayedCount} problem${displayedCount === 1 ? "" : "s"} so far, and that's all I currently have in this list. Would you like to explore a different topic?`
        : `I don't have any problems loaded yet. Would you like me to find some?`;

    await agentService.saveMessage(sessionId, "user", userMessage);
    await agentService.saveMessage(sessionId, "assistant", response);

    return { intent: intentResult.intent, reason: intentResult.reason, response };
  }

  if (intentResult.focusedProblem && existingPool) {
    const context = `
${agentService.buildSessionPoolDiscussionContext(existingPool)}

The user is asking about this specific problem. Stay focused on it.
Only reference other problems if the user explicitly asks to compare or switch.

Focused problem:
${JSON.stringify(intentResult.focusedProblem, null, 2)}
    `.trim();

    const response = await agentService.chat(sessionId, userMessage, {
      contextOverride: context,
      historyMode: "user-only",
    });

    return { intent: intentResult.intent, reason: intentResult.reason, response };
  }

  const requestedCount = extractRequestedCount(normalizedUserMessage);
  if (
    existingPool &&
    (intentResult.moreIntent === "wants_more" || requestedCount > 0)
  ) {
    const remainingCount = existingPool.items.length - existingPool.shownIndexes.length;

    if (remainingCount <= 0) {
      const response =
        `I don't have any more problems left in this current list for ${existingPool.query}. ` +
        `Would you like more from this same category, or do you want to explore a different topic?`;

      await agentService.saveMessage(sessionId, "user", userMessage);
      await agentService.saveMessage(sessionId, "assistant", response);

      return {
        intent: intentResult.intent,
        reason: intentResult.reason,
        response,
      };
    }

    const { sessionPool, curatedProblems } = await getCuratedProblemsForSession(
      sessionId,
      normalizedUserMessage
    );

    const response = agentService.formatCuratedProblemsResponse(
      sessionPool,
      curatedProblems,
      { isAdditionalBatch: true }
    );

    await agentService.saveMessage(sessionId, "user", userMessage);
    await agentService.saveMessage(sessionId, "assistant", response);

    return {
      intent: intentResult.intent,
      reason: intentResult.reason,
      response,
    };
  }

  const response = await agentService.chat(sessionId, userMessage, {
    contextOverride: existingPool
      ? agentService.buildSessionPoolDiscussionContext(existingPool)
      : undefined,
  });

  return {
    intent: intentResult.intent,
    reason: intentResult.reason,
    response,
  };
}
