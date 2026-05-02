import { Request, Response } from "express";
import { runDiscoveryPipeline } from "./discover.service";

export const discoverController = async (req: Request, res: Response) => {
  try {
    const { query } = req.body;

    // The original controller owned the full parse -> fetch -> filter -> classify ->
    // store sequence inline. That orchestration now lives in discover.service.ts so
    // the same pipeline can also be reused by the conversation module.
    const result = await runDiscoveryPipeline(query);
    const hasFetchedPosts = result.pipeline.fetched > 0;
    const hasFilteredPosts = result.pipeline.afterFilter > 0;

    return res.status(200).json({
      success: true,
      message: !hasFetchedPosts
        ? "No posts found for this query"
        : !hasFilteredPosts
          ? "No problems found after filtering"
          : "Discovery pipeline completed",
      data: {
        category: result.category,
        subreddits: result.subreddits,
        pipeline: result.pipeline,
        problems: result.problems,
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Something went wrong",
    });
  }
};
