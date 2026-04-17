import { Request, Response } from "express";
import { parseQuery } from "./queryParser.service";

export const queryParserController = async (req: Request, res: Response) => {
  try {
    const { query } = req.body;
    const result = parseQuery(query);
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