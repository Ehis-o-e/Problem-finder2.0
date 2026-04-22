import * as agentService from "../agent.module/agent.service";
import { callAI } from "../config/ai.config";
import {
  buildSessionPool,
  extractRequestedCount,
  getCuratedProblemsForSession,
} from "../discover.module/discover.service";
import type { SubredditResult } from "../queryParser.module/queryParser.service";
import { getSessionPool } from "../storage.module/storage.service";
import type { StoredProblem } from "../storage.module/storage.service";

type ConversationIntent = "discovery" | "conversation";

interface IntentResult {
  intent: ConversationIntent;
  reason: string;
}

/*
Legacy note:
The previous version of conversation.service.ts also owned:
- in-memory session pool storage
- result-count extraction
- selected-problem cleanup
- list context building
- discussion context building

That code has been moved under discover/storage/agent so conversation can go
back to being an orchestrator. Keeping the note here preserves what changed
for your review without hiding the architectural shift.
*/

function buildDiscoveryContext(
  query: string,
  result: Awaited<ReturnType<typeof buildSessionPool>>
): string {
  const headline =
    result.problems.length === 0? "No stored problems matched this discovery run yet."
    : `Here are relevant stored problems for the query "${query}":`;

  const problemList =
    result.problems.length === 0
      ? "No matching stored problems were available after the pipeline run."
      : result.problems
          .map(
            (problem, index) =>
              `${index + 1}. [${problem.category}] ${problem.title}\n   ${
                problem.summary ?? "No summary available."
              }`
          )
          .join("\n");

  return `
Discovery request detected.
Requested query: ${query}
Matched category: ${result.category}
Matched keywords: ${
    result.matchedKeywords.length > 0
      ? result.matchedKeywords.join(", ")
      : "none"
  }
Subreddits searched: ${result.subreddits
    .map((subreddit: SubredditResult) => subreddit.name)
    .join(", ")}
Pipeline summary:
- fetched: ${result.pipeline.fetched}
- afterFilter: ${result.pipeline.afterFilter}
- afterClassification: ${result.pipeline.afterClassification}
- saved: ${result.pipeline.saved}
- duplicates: ${result.pipeline.duplicates}
- total: ${result.pipeline.total}

${headline}
${problemList}
  `.trim();
}

function buildIntentFallback(
  userMessage: string,
  hasProblemContext: boolean
): IntentResult {
  const normalised = userMessage.toLowerCase();
  const discoverySignals = [
    "find problems",
    "discover",
    "search for",
    "look for",
    "show me problems",
    "what problems",
    "find pain points",
    "give me", 
    "suggest problems",
  ];

  const intent =
    !hasProblemContext &&
    discoverySignals.some((signal) => normalised.includes(signal))
      ? "discovery"
      : "conversation";

  return {
    intent,
    reason: "Fallback keyword routing used because AI intent parsing failed.",
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

  const prompt = `
You classify incoming chat messages for a problem-discovery backend.

Choose exactly one intent:
- "discovery": the user is asking the system to find or surface problem areas, pain points, or real-world problems for a topic.
- "conversation": the user is continuing an existing discussion, asking follow-up questions, asking for analysis, comparison, prioritisation, or refinement.

Return ONLY valid JSON in this exact format:
{
  "intent": "discovery" | "conversation",
  "reason": "short explanation"
}

Session has explicit problem context: ${session.problemId ? "yes" : "no"}
Session has discovered session pool: ${sessionPool ? "yes" : "no"}
Session already has history: ${history.length > 0 ? "yes" : "no"}
Recent history:
${recentHistory || "none"}

Current user message:
${userMessage}
  `.trim();

  try {
    const response = await callAI(prompt);
    const cleaned = response.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned) as Partial<IntentResult>;

    if (
      parsed.intent === "discovery" ||
      parsed.intent === "conversation"
    ) {
      return {
        intent: parsed.intent,
        reason: parsed.reason ?? "AI intent routing completed.",
      };
    }
  } catch (_error) {
    // Intentionally fall through to deterministic fallback.
  }

  return buildIntentFallback(userMessage, hasProblemContext);
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
): Promise<{
  intent: ConversationIntent;
  reason: string;
  response: string;
  discovery?: {
    category: string;
    matchedKeywords: string[];
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
}> {
  const intentResult = await detectIntent(sessionId, userMessage);
  const existingPool = getSessionPool(sessionId);
  const requestedCount = extractRequestedCount(userMessage);

  if (intentResult.intent === "discovery") {
    const discovery = await buildSessionPool(sessionId, userMessage);
    const { sessionPool, curatedProblems } = await getCuratedProblemsForSession(
      sessionId,
      userMessage
    );

    const response =
      curatedProblems.length > 0
        ? agentService.formatCuratedProblemsResponse(sessionPool, curatedProblems)
        : await agentService.chat(sessionId, userMessage, {
            contextOverride: buildDiscoveryContext(userMessage, discovery),
          });

    if (curatedProblems.length > 0) {
      await agentService.saveMessage(sessionId, "user", userMessage);
      await agentService.saveMessage(sessionId, "assistant", response);
    }

    return {
      intent: intentResult.intent,
      reason: intentResult.reason,
      response,
      discovery,
    };
  }

  if (existingPool) {
    const referenceResolution =
      await agentService.extractDisplayedProblemReference(
        userMessage,
        existingPool
      );

    if (referenceResolution.displayIndex) {
      const focusedContext = agentService.buildFocusedSessionProblemContext(
        existingPool,
        referenceResolution.displayIndex
      );

      if (focusedContext) {
        const response = await agentService.chat(sessionId, userMessage, {
          contextOverride: focusedContext,
          historyMode: "user-only",
        });

        return {
          intent: intentResult.intent,
          reason: intentResult.reason,
          response,
        };
      }
    }

    if (referenceResolution.refersToSpecificProblem) {
      const response =
        "I’m not completely sure which item from the last list you mean. Please refer to it by its number from that same list so I stay on the right issue.";

      await agentService.saveMessage(sessionId, "user", userMessage);
      await agentService.saveMessage(sessionId, "assistant", response);

      return {
        intent: intentResult.intent,
        reason: `${intentResult.reason} Specific problem reference could not be resolved safely.`,
        response,
      };
    }
  }

  if (existingPool && requestedCount > 0) {
    const { sessionPool, curatedProblems } = await getCuratedProblemsForSession(
      sessionId,
      userMessage
    );

    const response = agentService.formatCuratedProblemsResponse(
      sessionPool,
      curatedProblems,
      {
        isAdditionalBatch: true,
      }
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
