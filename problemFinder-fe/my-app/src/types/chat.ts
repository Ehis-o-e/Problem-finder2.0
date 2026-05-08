export type ChatRole = "assistant" | "user";

export type ConversationIntent =
  | "discovery"
  | "conversation"
  | "clarification";

export type ConversationTone = "default" | "error";

export type LoadingStageKey = "fetching" | "filtering" | "writing";

export type ConversationSessionResponse = {
  success: boolean;
  message?: string;
  error?: { code?: string; message?: string };
  data?: { sessionId: string };
};

export type ConversationChatResponse = {
  success: boolean;
  message?: string;
  error?: { code?: string; message?: string };
  data?: {
    intent: ConversationIntent;
    reason: string;
    response: string;
  };
};

export type ConversationMessage = {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: string;
  tone?: ConversationTone;
};

export type ChatThread = {
  id: string;
  title: string;
  sessionId: string | null;
  messages: ConversationMessage[];
  updatedAt: number;
};
