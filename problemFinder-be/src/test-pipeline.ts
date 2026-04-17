import dotenv from "dotenv";
dotenv.config();

import { parseQuery } from "./queryParser.module/queryParser.service";
import { fetchPosts } from "./fetcher.module/fetcher.service";
import { filterPosts } from "./filter.module/filter.service";
import { classifyPosts } from "./classifier.module/classifier.service";
import { storePosts } from "./storage.module/storage.service";

async function test(query: string) {
  console.log(`\nQuery: "${query}"\n`);

  // Step 1 — Query Parser
  console.log("Step 1: Parsing query...");
  const parsed = parseQuery(query);
  console.log(`Category: ${parsed.category}`);
  console.log(`Matched keywords: ${parsed.matchedKeywords.join(", ")}`);
  console.log(`Confidence: ${parsed.confidenceScore}`);
  console.log(`Subreddits: ${parsed.subreddits.join(", ")}\n`);

  // Step 2 — Fetcher
  console.log("Step 2: Fetching posts from Reddit...");
  const rawPosts = await fetchPosts(parsed.subreddits);
  console.log(`Raw posts fetched: ${rawPosts.length}\n`);

  // Step 3 — Filter
  console.log("Step 3: Filtering posts...");
  const filteredPosts = filterPosts(rawPosts);
  console.log(`Posts after filter: ${filteredPosts.length}`);
  console.log(`Discarded: ${rawPosts.length - filteredPosts.length}\n`);

  console.log("Sample of kept posts:");
  filteredPosts.slice(0, 3).forEach((post) => {
    console.log(`\nTitle: ${post.title}`);
    console.log(`Upvotes: ${post.upvotes}`);
    console.log(`Signals: ${post.matchedSignals.join(", ")}`);
    console.log(`URL: ${post.url}`);
  });

  console.log("Step 4: Classifying posts...");
  const classifiedPosts = classifyPosts(filteredPosts);

  console.log("Sample of classified posts:");
  classifiedPosts.slice(0, 3).forEach((post) => {
    console.log(`\nTitle: ${post.title}`);
    console.log(`Category: ${post.category}`);
    console.log(`Confidence: ${post.confidenceScore}`);
    console.log(`Upvotes: ${post.upvotes}`);
    console.log(`URL: ${post.url}`);
  });

  console.log("Step 5: Storing posts...");
  const result = await storePosts(classifiedPosts);
  console.log(`\nPipeline complete:`);
  console.log(`Total posts processed: ${result.total}`);
  console.log(`Saved to DB: ${result.saved}`);
  console.log(`Duplicates skipped: ${result.duplicates}`);
}

test("give me finance problem").catch(console.error);