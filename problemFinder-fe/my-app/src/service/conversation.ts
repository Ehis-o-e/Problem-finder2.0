import type {
  ConversationChatResponse,
  ConversationSessionResponse,
} from "../types/chat.ts";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ??
  (import.meta.env.DEV ? "http://localhost:5050/api/v1" : "/api/v1");

function getApiErrorMessage(
  payload: { message?: string; error?: { message?: string } } | null,
  fallback: string,
  status?: number
) {
  const message = payload?.error?.message?.trim() || payload?.message?.trim();
  return message || (status ? `${fallback} (HTTP ${status})` : fallback);
}

export async function createConversationSession(problemId?: string) {
  const response = await fetch(`${API_BASE_URL}/conversation/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(problemId ? { problemId } : {}),
  });

  const payload = (await response
    .json()
    .catch(() => null)) as ConversationSessionResponse | null;

  if (!response.ok || !payload?.success || !payload.data?.sessionId) {
    throw new Error(
      getApiErrorMessage(payload, "Could not create session.", response.status)
    );
  }

  return payload.data.sessionId;
}

export async function sendConversationMessage(
  sessionId: string,
  message: string
) {
  const response = await fetch(`${API_BASE_URL}/conversation/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, message }),
  });

  const payload = (await response
    .json()
    .catch(() => null)) as ConversationChatResponse | null;

  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(
      getApiErrorMessage(payload, "Assistant failed to respond.", response.status)
    );
  }

  return payload.data;
}
