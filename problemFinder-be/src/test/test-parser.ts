import dotenv from "dotenv";
dotenv.config();

import { normalizeUserMessageForRouting } from "../conversation.module/conversation.service";
import { extractTopicFromDiscoveryQuery } from "../conversation.module/conversation.service";
import { parseQuery } from "../queryParser.module/queryParser.service";

async function test(query: string) {
  console.log(`Original: "${query}"\n`);

  const normalized = await normalizeUserMessageForRouting(query);
  console.log(`Normalized: "${normalized}"`);

  const topic = await extractTopicFromDiscoveryQuery(normalized);
  console.log(`Extracted topic: "${topic}"\n`);

  const parsed = await parseQuery(topic);

  console.log(`Category: ${parsed.category}`);
  console.log(`Subreddits (${parsed.subreddits.length}):`);
  parsed.subreddits.forEach((s, i) => {
    console.log(`  ${i + 1}. r/${s.name}`);
  });
}

const query = "give me some advice on how to stop procrastinating and be more productive at work";

test(query).catch(console.error);