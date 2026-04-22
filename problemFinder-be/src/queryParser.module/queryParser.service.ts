import dotenv from "dotenv";
import { callAI } from "../config/ai.config";
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
   "help", "gimme", "lemme"
]);

function uniqueTerms(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function cleanQueryText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

async function normalizeQueryForDiscovery(rawQuery: string): Promise<string> {
  const cleanedRawQuery = cleanQueryText(rawQuery);

  if (!cleanedRawQuery) {
    return rawQuery;
  }

  const prompt = `
You rewrite short user requests into clear, proper English for a problem-discovery search system.

Return ONLY valid JSON in this exact shape:
{
  "normalizedQuery": "string"
}

Rules:
- Preserve the user's original topic and intent.
- Fix spelling, grammar, shorthand, and slang.
- Expand phrases like "gimme" into normal English.
- Keep the rewritten query concise.
- Do not add new topics, constraints, or meaning.
- If the query is already clear enough, return it unchanged.

User query:
${cleanedRawQuery}
  `.trim();

  try {
    const response = await callAI(prompt);
    const cleanedResponse = response.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleanedResponse) as {
      normalizedQuery?: string;
    };
    const normalizedQuery = cleanQueryText(parsed.normalizedQuery ?? "");

    return normalizedQuery.length > 0 ? normalizedQuery : cleanedRawQuery;
  } catch (_error) {
    return cleanedRawQuery;
  }
}

export async function parseQuery(rawQuery: string): Promise<QueryParserResult> {
  const normalizedQuery = await normalizeQueryForDiscovery(rawQuery);
  const normalised = normalizedQuery.toLowerCase().trim();

  const baseKeywords = normalised
    .split(" ")
    .filter(w => w.length > 3 && !STOP_WORDS.has(w));

  const searchQuery = baseKeywords.slice(0, 2).join(" ") || "general";

  const subreddits = await findBestSubreddits(searchQuery);

  // derive category from Reddit's top result — already a clean topic label
  const category = subreddits[0]?.name.toLowerCase() || baseKeywords[0] || "general";
  const matchedKeywords = uniqueTerms([...baseKeywords, category]);

  console.log("Original query:", rawQuery);
  console.log("Normalized query:", normalizedQuery);

  return {
    category,
    matchedKeywords,
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
