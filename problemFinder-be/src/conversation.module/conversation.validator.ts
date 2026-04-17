import { z } from "zod";

export const createConversationSessionSchema = z.object({
  body: z.object({
    problemId: z.string().uuid().optional(),
  }),
});

export const conversationChatSchema = z.object({
  body: z.object({
    sessionId: z.string().uuid("Invalid session ID"),
    message: z
      .string({ error: "Message is required" })
      .trim()
      .min(1, "Message cannot be empty")
      .max(1000, "Message must not exceed 1000 characters"),
  }),
});

export const conversationHistorySchema = z.object({
  params: z.object({
    sessionId: z.string().uuid("Invalid session ID"),
  }),
});
