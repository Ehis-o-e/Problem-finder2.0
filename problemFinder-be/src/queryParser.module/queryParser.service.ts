import dotenv from "dotenv";
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

// Minimum number of subreddits needed for the fetcher to have
// enough sources to pull a meaningful number of posts from
const MIN_SUBREDDITS = 3;


// Collapses multiple spaces and trims leading/trailing whitespace
function cleanQueryText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

// Hits the Reddit public search API for subreddits matching a query.
// Returns only subreddits with more than 1000 subscribers to filter
// out inactive or irrelevant communities.
async function searchReddit(query: string): Promise<SubredditResult[]> {
  const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&type=sr&limit=5`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": process.env.REDDIT_USER_AGENT ?? "web:ProblemDiscoveryBot:1.0",
    },
  });

  if (!res.ok) {
    console.error("Reddit search failed:", res.status, res.statusText);
    return [];
  }

  const data = await res.json() as RedditSearchResponse;

  return data.data.children
    .map((c) => c.data)
    .filter((s) => s.subscribers > 1000)
    .map((s) => ({
      name: s.display_name,
      subscribers: s.subscribers,
      description: s.public_description?.trim() || "No description available",
    }));
}

// Builds a list of at least MIN_SUBREDDITS relevant subreddits using
// a three-tier accumulation strategy:
//
// Tier 1 — search using the full query phrase. This gives the most
//           contextually relevant results and will usually be enough.
//
// Tier 2 — if Tier 1 didn't return enough, search each keyword
//           individually and accumulate new results. Stops early
//           if MIN_SUBREDDITS is reached before all keywords are tried.
//
// Tier 3 — if still not enough, pad with known high-traffic subreddits
//           that are broad enough to contain relevant posts for most topics.
//
// Deduplication is applied across all tiers so the same subreddit
// is never added twice.
async function findBestSubreddits(
  searchQuery: string,
  keywords: string[]
): Promise<SubredditResult[]> {
  console.log("Search query sent to Reddit:", searchQuery);

  const collected: SubredditResult[] = [];

  // Tier 1 — full query
  const fullQueryResults = await searchReddit(searchQuery);
  collected.push(...fullQueryResults);

  // Tier 2 — supplement with individual keywords if needed
  if (collected.length < MIN_SUBREDDITS) {
    for (const keyword of keywords) {
      if (collected.length >= MIN_SUBREDDITS) break;

      const keywordResults = await searchReddit(keyword);

      // only add subreddits not already in the collected list
      const newResults = keywordResults.filter(
        (r) => !collected.some((c) => c.name === r.name)
      );

      collected.push(...newResults);

      if (newResults.length > 0) {
        console.warn(`Supplemented results with keyword: "${keyword}"`);
      }
    }
  }

  // Tier 3 — pad with safe fallbacks if still under the minimum
  if (collected.length < MIN_SUBREDDITS) {
    console.warn("Not enough subreddits found. Padding with safe fallbacks.");

    const fallbacks = [
      { name: "self", subscribers: 1000000, description: "General discussion" },
      { name: "AskReddit", subscribers: 40000000, description: "General questions and discussion" },
    ].filter((f) => !collected.some((c) => c.name === f.name));

    collected.push(...fallbacks);
  }

  return collected;
}

// Parses a normalized user query into a structured result the discovery
// pipeline can use for targeting subreddits and categorizing problems.
//
// The query is expected to already be normalized by normalizeUserMessageForRouting
// in conversation.service.ts before reaching this function, so no stop word
// filtering is needed — a simple length filter is sufficient.
export async function parseQuery(rawQuery: string): Promise<QueryParserResult> {
  const cleanedQuery = cleanQueryText(rawQuery);

  

  // Split the cleaned query into keywords, dropping single and
  // double character tokens which are unlikely to carry topic signal
  const baseKeywords = cleanedQuery
    .toLowerCase()
    .split(" ")
    .filter(w => w.length > 3);

  // Derive category from the first three keywords rather than the subreddit
  // name — subreddit names are Reddit labels and not clean topic labels
  const category = baseKeywords.slice(0, 3).join(" ") || "general";

  // Find subreddits using the full query first, falling back to
  // keywords and safe defaults if needed
  const subreddits = await findBestSubreddits(cleanedQuery, baseKeywords);

  console.log("Original query:", rawQuery);
  console.log("Parsed keywords:", baseKeywords);
  console.log("Category:", category);
  console.log("Subreddits found:", subreddits);

  return {
    category,
    subreddits,
    originalQuery: rawQuery,
  };
}