import dotenv from "dotenv";
import { scheduleRedditRequest } from "../utils/reddit-request.utils";
dotenv.config();

export interface SubredditResult {
  name: string;
  subscribers: number;
  description: string;
}

export interface QueryParserResult {
  category: string;
  subreddits: SubredditResult[];
  originalQuery: string;
}

interface RedditSearchResponse {
  data: {
    children: {
      data: {
        display_name: string;
        subscribers: number;
        public_description: string;
      };
    }[];
  };
}

interface RedditAboutResponse {
  data: {
    display_name: string;
    subscribers: number;
    public_description: string;
  };
}

// In-memory cache for subreddit metadata.
// Prevents repeated Reddit API calls for the same subreddit
// across different searches on the live server.
const metadataCache = new Map<string, SubredditResult>();

function cleanQueryText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function extractSubredditName(url: string): string | null {
  const match = url.match(/reddit\.com\/r\/([A-Za-z0-9_]+)/);
  return match ? match[1] : null;
}

async function searchBrave(query: string): Promise<string[]> {
  try {
    const apiKey = process.env.BRAVE_SEARCH_API_KEY;
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(`site:reddit.com/r/ ${query} problems`)}&count=10`;
    console.log("Brave search URL:", url);

    const res = await fetch(url, {
      headers: {
        "Accept": "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": apiKey!,
      },
    });

    if (!res.ok) {
      console.error("Brave search failed:", res.status, res.statusText);
      return [];
    }

    const data = await res.json() as { web?: { results?: { url: string }[] } };
    if (!data.web?.results) return [];

    return data.web.results
      .map((item) => extractSubredditName(item.url))
      .filter(Boolean) as string[];
  } catch (error) {
    console.error("Brave search threw an error:", error);
    return [];
  }
}

async function searchReddit(query: string): Promise<{ name: string }[]> {
  try {
    const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&type=sr&limit=5`;

    const res = await scheduleRedditRequest(`search "${query}"`, () =>
      fetch(url, {
        headers: {
          "User-Agent": process.env.REDDIT_USER_AGENT ?? "web:ProblemDiscoveryBot:1.0",
        },
      })
    );

    if (!res.ok) {
      console.error("Reddit search failed:", res.status, res.statusText);
      return [];
    }

    const data = await res.json() as RedditSearchResponse;
    return data.data.children.map((c) => ({ name: c.data.display_name }));
  } catch (error) {
    console.error("Reddit search threw an error:", error);
    return [];
  }
}

async function fetchRedditMetadata(subredditName: string): Promise<SubredditResult | null> {
  // Return cached result if available — avoids hitting Reddit again
  if (metadataCache.has(subredditName)) {
    console.log(`Cache hit for r/${subredditName}`);
    return metadataCache.get(subredditName)!;
  }

  try {
    const url = `https://www.reddit.com/r/${subredditName}/about.json`;
    console.log("Reddit metadata URL:", url);

    const res = await scheduleRedditRequest(`metadata "${subredditName}"`, () =>
      fetch(url, {
        headers: {
          "User-Agent": process.env.REDDIT_USER_AGENT ?? "web:ProblemDiscoveryBot:1.0",
        },
      })
    );

    if (!res.ok) {
      console.error(`Failed to fetch metadata for r/${subredditName}:`, res.status);
      return null;
    }

    const data = await res.json() as RedditAboutResponse;
    if (!data.data || data.data.subscribers < 1000) return null;

    const metadata: SubredditResult = {
      name: data.data.display_name,
      subscribers: data.data.subscribers,
      description: data.data.public_description?.trim() || "No description available",
    };

    // Store in cache before returning
    metadataCache.set(subredditName, metadata);
    return metadata;
  } catch (error) {
    console.error(`fetchRedditMetadata threw an error for r/${subredditName}:`, error);
    return null;
  }
}

async function findBestSubreddits(searchQuery: string): Promise<SubredditResult[]> {
  console.log("Search query sent to Brave:", searchQuery);

  const collected: SubredditResult[] = [];
  const seenNames = new Set<string>();

  async function addSubreddits(names: string[]) {
    for (const name of names) {
      if (seenNames.has(name)) continue;
      seenNames.add(name);
      const metadata = await fetchRedditMetadata(name);
      if (metadata) collected.push(metadata);
    }
  }

  // Tier 1 — Brave search (context-aware)
  const braveNames = await searchBrave(searchQuery);
  await addSubreddits(braveNames);

  // Tier 2 — Reddit only if Brave didn't return enough
  if (collected.length < 5) {
    console.warn(`Brave only returned ${collected.length}, supplementing with Reddit...`);
    const redditResults = await searchReddit(`${searchQuery} problems`);
    await addSubreddits(redditResults.map((r) => r.name));
  }

  // Sort by subscribers and cap at 5
  return collected
    .sort((a, b) => b.subscribers - a.subscribers)
    .slice(0, 5);
}

export async function parseQuery(rawQuery: string): Promise<QueryParserResult> {
  const cleanedQuery = cleanQueryText(rawQuery);
  const category = cleanedQuery.toLowerCase().split(" ").slice(0, 2).join(" ") || "general";
  const subreddits = await findBestSubreddits(cleanedQuery);

  console.log("Original query:", rawQuery);
  console.log("Category:", category);
  console.log("Subreddits found:", subreddits);

  return {
    category,
    subreddits,
    originalQuery: rawQuery,
  };
}