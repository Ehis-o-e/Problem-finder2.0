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

interface IntentResult {
  intent: ConversationIntent;
  reason: string;
  focusedProblem: SessionPoolItem | null;
  askForMore: boolean;
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
- Do not remove any words — only fix how they are written.
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

  // fallback — return the normalized message as-is
  return normalizedMessage;
}


function buildIntentFallback(
  hasProblemContext: boolean
): IntentResult {

  const intent = hasProblemContext  ? "conversation" : "discovery";

  return {
    intent,
    reason: "Fallback keyword routing used because AI intent parsing failed.",
    focusedProblem: null,
    askForMore: false,
  };
}

async function detectIntent(sessionId: string,userMessage: string): Promise<IntentResult> {

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

  const recentHistory = history.slice(-20).map((message) => 
    `${message.role}: ${message.content}`).join("\n");

  const displayedProblems = sessionPool
    ? sessionPool.lastPresentedIndexes.map((index, displayIndex) => ({
        displayIndex: displayIndex + 1,
        ...sessionPool.items[index],
      }))
    : [];

  const prompt = `
You classify incoming chat messages for a problem-discovery backend.

Choose exactly one intent:
- "discovery": the user is asking the system to find or surface problem areas, pain points, or real-world problems for a topic.
- "conversation": the user is continuing an existing discussion, asking follow-up questions, asking for analysis, comparison, prioritisation, or refinement.
- "clarification":ONLY use this when the message is a vague pronoun or reference with no topic
  and no clear link to the displayed list — e.g. "that one", "tell me more", "what about it".
  Any message containing a recognizable topic or domain should NEVER be "clarification".
  When in doubt between "discovery" and "clarification", always choose "discovery".

  IMPORTANT RULES:
- "give me more", "show me more", "more problems", "gimme more" — these are ALWAYS "conversation" because the user wants more from the current session, not a new discovery.
- Only use "discovery" when the user is clearly asking about a NEW topic they haven't explored yet.
- If there is an active session pool and the user asks for "more", that is ALWAYS "conversation".

If the intent is "conversation" and the user references a specific problem by number (e.g. "explain the 4th one", "tell me about problem 2"):
- If that number exists in the displayed list, set "focusedProblem" to that problem's full object from the list.
- If that number does NOT exist in the displayed list, set "askForMore" to true.

Return ONLY valid JSON in this exact format:
{
  "intent": "discovery" | "conversation" | "clarification",
  "reason": "short explanation",
  "focusedProblem": { problem object from displayed list } | null,
  "askForMore": true | false
}

Session has explicit problem context: ${session.problemId ? "yes" : "no"}
Session has discovered session pool: ${sessionPool ? "yes" : "no"}
Session already has history: ${history.length > 0 ? "yes" : "no"}
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
        askForMore: parsed.askForMore ?? false,
      };
    }
  } catch (_error) {
    // Intentionally fall through to deterministic fallback.
  }

  return buildIntentFallback( hasProblemContext);
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

  if (intentResult.askForMore) {
    const listSize = existingPool?.lastPresentedIndexes.length ?? 0;
    const response = listSize > 0
      ? `I only have problems 1–${listSize} in the current list. Would you like to pick one of those, or say "more" and I'll find you new problems?`
      : `I don't have any problems loaded yet. Would you like me to find some?`;

    await agentService.saveMessage(sessionId, "user", userMessage);
    await agentService.saveMessage(sessionId, "assistant", response);

    return { intent: intentResult.intent, reason: intentResult.reason, response };
  }

  if (intentResult.focusedProblem && existingPool) {
    const context = `
      You are discussing problems from the user's current session pool.
      Current topic: ${existingPool.query}
      Category: ${existingPool.category}

      The user is asking about this specific problem. Stay focused on it.
      Only reference other problems if the user explicitly asks to compare or switch.

      Problem:
      ${JSON.stringify(intentResult.focusedProblem, null, 2)}
          `.trim();

    const response = await agentService.chat(sessionId, userMessage, {
      contextOverride: context,
      historyMode: "user-only",
    });

    return { intent: intentResult.intent, reason: intentResult.reason, response };
  }

const requestedCount = extractRequestedCount(normalizedUserMessage);
  if (existingPool && requestedCount > 0) {
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
