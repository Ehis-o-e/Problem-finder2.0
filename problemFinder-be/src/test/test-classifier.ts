import { parseQuery } from "../queryParser.module/queryParser.service";
import { fetchPosts } from "../fetch.module/fetch.service";
import { filterPosts } from "../filter.module/filter.service";
import { classifyPosts } from "../classifier.module/classifier.service";

async function test() {
  const query = "problems related with power generation";

  console.log("=== Pipeline Test ===\n");
  console.log(`Query: "${query}"\n`);

  console.log("Step 1: Parsing query...");
  const parsed = await parseQuery(query);
  console.log(`Category:  ${parsed.category}`);
  console.log("Subreddits found:");
  parsed.subreddits.forEach((subreddit) =>
    console.log(
      `  r/${subreddit.name} - ${subreddit.subscribers.toLocaleString()} subscribers`
    )
  );
  console.log();

  console.log("Step 2: Fetching posts from Reddit...");
  const rawPosts = await fetchPosts(parsed.subreddits.map((subreddit) => subreddit.name));
  console.log(`Fetched: ${rawPosts.length} posts\n`);

  console.log("Step 3: Filtering posts...");
  const filteredPosts = await filterPosts(rawPosts);
  console.log(`After filter: ${filteredPosts.length} posts\n`);

  console.log("Step 4: Classifying posts...");
  const classifiedPosts = await classifyPosts(filteredPosts, parsed);
  console.log(`After classification: ${classifiedPosts.length} posts\n`);

  console.log("=== Top Results ===\n");
  classifiedPosts.slice(0, 5).forEach((post, index) => {
    console.log(`${index + 1}. ${post.title}`);
    console.log(`   Subreddit:  r/${post.subreddit}`);
    console.log(`   Confidence: ${post.confidenceScore}`);
    console.log(`   Matched:    ${post.relevanceReason}`);
    console.log(`   Upvotes:    ${post.upvotes}`);
    console.log(`   URL:        ${post.url}`);
    console.log();
  });

  console.log("=== Pipeline Summary ===");
  console.log(`Fetched:    ${rawPosts.length}`);
  console.log(`Filtered:   ${filteredPosts.length}`);
  console.log(`Classified: ${classifiedPosts.length}`);
}

test().catch(console.error);
