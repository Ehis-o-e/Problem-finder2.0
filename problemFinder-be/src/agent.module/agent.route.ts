import { Router } from "express";
import { validate } from "../middleware/validate.middleware";
import {
  createSessionSchema,
  chatSchema,
  getHistorySchema,
} from "./agent.validator";
import {
  createSessionController,
  chatController,
  getHistoryController,
} from "./agent.controller";

const router = Router();

// Create a new chat session — no auth required, works for guests too
router.post("/session", validate(createSessionSchema), createSessionController);

// Send a message and get a response
router.post("/chat", validate(chatSchema), chatController);

// Get conversation history for a session
router.get(
  "/history/:sessionId",
  validate(getHistorySchema),
  getHistoryController
);

export default router;