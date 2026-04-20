import dotenv from "dotenv";
dotenv.config();

import { parseQuery } from "../queryParser.module/queryParser.service";
import { fetchPosts } from "../fetcher.module/fetcher.service";
import { filterPosts } from "../filter.module/filter.service";
import { classifyPosts } from "../classifier.module/classifier.service";
import { storePosts } from "../storage.module/storage.service";

async function test(query: string) {
  console.log(`\nQuery: "${query}"\n`);

  console.log("Step 1: Parsing query...");
  const parsed = await parseQuery(query);
  console.log(`Category: ${parsed.category}`);
  console.log(`Matched keywords: ${parsed.matchedKeywords.join(", ")}`);
  console.log(
    `Subreddits: ${parsed.subreddits.map((subreddit) => subreddit.name).join(", ")}\n`
  );

  console.log("Step 2: Fetching posts from Reddit...");
  const rawPosts = await fetchPosts(
    parsed.subreddits.map((subreddit) => subreddit.name)
  );
  console.log(`Raw posts fetched: ${rawPosts.length}\n`);

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

  console.log("\nStep 4: Classifying posts...");
  const classifiedPosts = classifyPosts(filteredPosts, parsed);

  console.log("Sample of classified posts:");
  classifiedPosts.slice(0, 3).forEach((post) => {
    console.log(`\nTitle: ${post.title}`);
    console.log(`Category: ${post.category}`);
    console.log(`Confidence: ${post.confidenceScore}`);
    console.log(`Upvotes: ${post.upvotes}`);
    console.log(`URL: ${post.url}`);
  });

  console.log("\nStep 5: Storing posts...");
  const result = await storePosts(classifiedPosts);
  console.log(`\nPipeline complete:`);
  console.log(`Total posts processed: ${result.total}`);
  console.log(`Saved to DB: ${result.saved}`);
  console.log(`Duplicates skipped: ${result.duplicates}`);
}

test("give me finance problem").catch(console.error);
