import dotenv from "dotenv";
dotenv.config();

export interface QueryParserResult {
  category: string;
  matchedKeywords: string[];
  subreddits: string[];
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
  "problems", "issues", "find", "looking", "want", "help"
]);

export async function parseQuery(rawQuery: string): Promise<QueryParserResult> {
  const normalised = rawQuery.toLowerCase().trim();

  const keywords = normalised
    .split(" ")
    .filter(w => w.length > 3 && !STOP_WORDS.has(w));

  const category = keywords.join(" ") || "General";
  const searchQuery = keywords.slice(0, 3).join(" ") || "general";

  const subreddits = await findBestSubreddits(searchQuery);

  return {
    category,
    matchedKeywords: keywords,
    subreddits,
  };
}

async function findBestSubreddits(searchQuery: string): Promise<string[]> {
  console.log("Search query sent to Reddit:", searchQuery);
  
  const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(searchQuery)}&type=sr&limit=5`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": process.env.REDDIT_USER_AGENT,
    },
  });

  if (!res.ok) {
    console.error("Reddit search failed:", res.status, res.statusText);
    return ["general"]
  };

  const data = await res.json() as RedditSearchResponse;;

  const subreddits: string[] = data.data.children
    .map((c: any) => c.data as { display_name: string; subscribers: number })
    .filter(s => s.subscribers > 1000)
    .map(s => s.display_name);

  return subreddits.length > 0 ? subreddits : ["general"];
}