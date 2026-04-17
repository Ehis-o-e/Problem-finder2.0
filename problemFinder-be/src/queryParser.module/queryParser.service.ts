import { DOMAIN_VOCABULARY, SUBREDDIT_MAP } from "./queryParser.vocabulary";

export interface QueryParserResult {
  category: string;
  matchedKeywords: string[];
  confidenceScore: number;
  subreddits: string[];
}

// Built once at startup — never rebuilt on each request
const keywordCategoryMap = new Map<string, string>();


for (const [category, keywords] of Object.entries(DOMAIN_VOCABULARY)) {
  for (const keyword of keywords) {
    keywordCategoryMap.set(keyword, category);
  }
}

export function parseQuery(rawQuery: string): QueryParserResult {
  const normalised = rawQuery.toLowerCase().trim();

  const scores: Record<string, number> = {};
  const matchedKeywords: string[] = [];

  for (const [keyword, category] of keywordCategoryMap.entries()) {
    if (normalised.includes(keyword)) {
      scores[category] = (scores[category] || 0) + 1;
      matchedKeywords.push(keyword);
    }
  }

  const topCategory = Object.entries(scores).reduce(
    (best, [category, score]) =>
      score > best.score ? { category, score } : best,
    { category: "General", score: 0 }
  );

  const totalKeywordsInCategory =
    DOMAIN_VOCABULARY[topCategory.category]?.length ?? 1;

  const confidenceScore =
    topCategory.score === 0
      ? 0
      : parseFloat((topCategory.score / totalKeywordsInCategory).toFixed(2));

  const category =
    topCategory.score === 0 ? "General" : topCategory.category;

  const subreddits = SUBREDDIT_MAP[category] ?? SUBREDDIT_MAP["General"];

  return {
    category,
    matchedKeywords,
    confidenceScore,
    subreddits,
  };
}