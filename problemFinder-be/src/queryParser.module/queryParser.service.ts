import dotenv from "dotenv";
dotenv.config();

export interface SubredditResult {
  name: string;
  subscribers: number;
  description: string;
}

export interface QueryParserResult {
  category: string;
  matchedKeywords: string[];
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

const STOP_WORDS = new Set([
  "i", "a", "the", "is", "it", "in", "on", "at", "to", "for",
  "of", "and", "or", "but", "with", "about", "want", "find",
  "looking", "need", "help", "me", "my", "what", "how", "are",
  "there", "some", "any", "can", "do", "get", "show", "tell",
  "please", "just", "really", "very", "more", "also", "would",
  "could", "should", "have", "has", "been", "was", "were", "am",
  "problems", "problem", "issue", "issues", "find", "looking", "want", "give",
   "help"
]);

export async function parseQuery(rawQuery: string): Promise<QueryParserResult> {
  const normalised = rawQuery.toLowerCase().trim();

  const keywords = normalised
    .split(" ")
    .filter(w => w.length > 3 && !STOP_WORDS.has(w));

  const searchQuery = keywords.slice(0, 2).join(" ") || "general";

  const subreddits = await findBestSubreddits(searchQuery);

  // derive category from Reddit's top result — already a clean topic label
  const category = subreddits[0]?.name.toLowerCase() || keywords[0] || "general";

  return {
    category,
    matchedKeywords: keywords,
    subreddits,
    originalQuery: rawQuery,
  };
}

async function findBestSubreddits(searchQuery: string): Promise<SubredditResult[]> {
  console.log("Search query sent to Reddit:", searchQuery);

  const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(searchQuery)}&type=sr&limit=5`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": process.env.REDDIT_USER_AGENT ?? "web:ProblemDiscoveryBot:1.0",
    },
  });

  if (!res.ok) {
    console.error("Reddit search failed:", res.status, res.statusText);
    return [{ name: "general", subscribers: 0, description: "" }];
  }

  const data = await res.json() as RedditSearchResponse;

  const subreddits: SubredditResult[] = data.data.children
    .map((c) => c.data)
    .filter((s) => s.subscribers > 1000)
    .map((s) => ({
      name: s.display_name,
      subscribers: s.subscribers,
      description: s.public_description?.trim() || "No description available",
    }));

  console.log("Subreddits found:", subreddits);

  return subreddits.length > 0
    ? subreddits
    : [{ name: "general", subscribers: 0, description: "" }];
}