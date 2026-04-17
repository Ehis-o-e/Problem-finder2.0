import { Request, Response } from "express";
import * as agentService from "./agent.service";
//import { AuthUser } from "../../types/auth";

export const createSessionController = async (req: Request, res: Response) => {
  try {
    const { problemId } = req.body;
    //const user = req.user as AuthUser | undefined;

    const sessionId = await agentService.createSession(
      //user?.id ?? undefined,
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

export const chatController = async (req: Request, res: Response) => {
  try {
    const { sessionId, message } = req.body;

    const response = await agentService.chat(sessionId, message);

    return res.status(200).json({
      success: true,
      data: { response },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Something went wrong",
    });
  }
};

export const getHistoryController = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    const messages = await agentService.getHistory(sessionId);

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