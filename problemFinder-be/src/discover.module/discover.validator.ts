import { z } from "zod";

export const discoverSchema = z.object({
  body: z.object({
    query: z
      .string({ error: "Query is required" })
      .trim()
      .min(2, "Query must be at least 2 characters")
      .max(300, "Query must not exceed 300 characters"),
  }),
});

export type DiscoverSchema = z.infer<typeof discoverSchema>;