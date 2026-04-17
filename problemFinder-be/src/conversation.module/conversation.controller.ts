import { Request, Response } from "express";
import * as conversationService from "./conversation.service";

export const createConversationSessionController = async (
  req: Request,
  res: Response
) => {
  try {
    const { problemId } = req.body;

    const sessionId = await conversationService.createSession(
      undefined,
      problemId ?? undefined
    );

    return res.status(201).json({
      success: true,
      data: { sessionId },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Something went wrong",
    });
  }
};

export const conversationChatController = async (
  req: Request,
  res: Response
) => {
  try {
    const { sessionId, message } = req.body;

    const result = await conversationService.handleConversation(
      sessionId,
      message
    );

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Something went wrong",
    });
  }
};

export const conversationHistoryController = async (
  req: Request,
  res: Response
) => {
  try {
    const { sessionId } = req.params;
    const messages = await conversationService.getHistory(sessionId);

    return res.status(200).json({
      success: true,
      data: { messages },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Something went wrong",
    });
  }
};
