import { FilteredPost } from "../filter.module/filter.service";
import { QueryParserResult } from "../queryParser.module/queryParser.service";

export interface ClassifiedPost extends FilteredPost {
  category: string;
  confidenceScore: number;
  matchedTerms: string[];
  relevanceReason: string;
}

function scorePost(
  post: FilteredPost,
  parsed: QueryParserResult
): { score: number; matchedTerms: string[]; reason: string } {
  const title = post.title.toLowerCase();
  const body = post.body.toLowerCase();
  const subreddit = (post.subreddit ?? "").toLowerCase();

  const matchedTerms: string[] = [];
  let rawScore = 0;

  for (const keyword of parsed.matchedKeywords) {
    // title match — highest weight
    if (title.includes(keyword)) {
      rawScore += 3;
      matchedTerms.push(`title:${keyword}`);
    }
    // body match — medium weight
    if (body.includes(keyword)) {
      rawScore += 2;
      matchedTerms.push(`body:${keyword}`);
    }
    // subreddit name match — medium weight
    if (subreddit.includes(keyword)) {
      rawScore += 2;
      matchedTerms.push(`subreddit:${keyword}`);
    }
  }

  // bonus if category word appears in title
  if (title.includes(parsed.category)) {
    rawScore += 2;
  }

  // normalize to 0-1
  const maxPossibleScore = parsed.matchedKeywords.length * 7; // 3+2+2 per keyword
  const score = maxPossibleScore > 0
    ? parseFloat((rawScore / maxPossibleScore).toFixed(2))
    : 0;

  // build a human readable reason
  const uniqueMatches = [...new Set(matchedTerms.map(t => t.split(":")[1]))];
  const reason = uniqueMatches.length > 0
    ? `matched: ${uniqueMatches.join(", ")}`
    : "no match";

  return { score, matchedTerms, reason };
}

export function classifyPosts(
  posts: FilteredPost[],
  parsed: QueryParserResult
): ClassifiedPost[] {
  return posts
    .map(post => {
      const { score, matchedTerms, reason } = scorePost(post, parsed);
      return {
        ...post,
        category: parsed.category,
        confidenceScore: score,
        matchedTerms,
        relevanceReason: reason,
      };
    })
    .filter(post => post.confidenceScore > 0)       // drop irrelevant posts
    .sort((a, b) => b.confidenceScore - a.confidenceScore); // best first
}