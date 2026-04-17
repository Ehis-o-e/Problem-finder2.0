import { Router } from "express";
import { validate } from "../middleware/validate.middleware";
import {
  conversationChatSchema,
  conversationHistorySchema,
  createConversationSessionSchema,
} from "./conversation.validator";
import {
  conversationChatController,
  conversationHistoryController,
  createConversationSessionController,
} from "./conversation.controller";

const router = Router();

router.post(
  "/session",
  validate(createConversationSessionSchema),
  createConversationSessionController
);

router.post("/chat", validate(conversationChatSchema), conversationChatController);

router.get(
  "/history/:sessionId",
  validate(conversationHistorySchema),
  conversationHistoryController
);

export default router;
