import { RawPost } from "../fetch.module/fetch.service";
import {
  embedBatch,
  findMatches,
  rankAnchorMatches,
  AnchorMatch,
} from "../embedding.module/embedding.service";
import { EMBEDDING_CONFIG } from "../config/embedding.config";

export interface FilteredPost extends RawPost {
  matches: AnchorMatch[];
  topCategory: string;
  topScore: number;
  vector: number[];
}

function formatMatch(match: AnchorMatch): string {
  return `${match.category}:${match.score.toFixed(3)} "${match.anchor}"`;
}

const PRE_FILTER_KEYWORDS = [
  // asking for help
  "help", "how do i", "how can i", "how to", "anyone know", "anyone else",
  "advice", "suggestions", "recommendations", "what should i",

  // problem signals
  "problem", "issue", "issues", "bug", "error", "broken", "fault",
  "not working", "doesn't work", "won't work", "can't get", "failed", "failing",

  // struggle signals
  "struggling", "stuck", "lost", "confused", "overwhelmed", "exhausted",
  "burnout", "burned out", "can't cope", "can't handle", "falling behind",

  // frustration signals
  "frustrated", "frustrating", "annoying", "annoyed", "angry", "furious",
  "fed up", "sick of", "tired of", "hate", "horrible", "terrible", "awful",
  "worst", "useless", "pointless", "ridiculous",

  // pain signals
  "pain", "painful", "suffer", "suffering", "hard", "difficult", "impossible",
  "nightmare", "disaster", "mess", "chaos",

  // need signals
  "need", "needs", "need help", "desperately", "urgent", "please",

  // negative experience
  "waste", "wasting", "inefficient", "broken system", "no solution",
  "nobody", "nothing works", "keeps happening", "always happens",
  "every time", "still not", "still broken", "never works",

  // emotional
  "rant", "venting", "vent", "complain", "complaint", "regret",
  "wish", "should be", "shouldn't have to",
];

function cheapPreFilter(post: RawPost): boolean {
  const text = `${post.title} ${post.body}`.toLowerCase();
  return PRE_FILTER_KEYWORDS.some((kw) => text.includes(kw));
}

export async function filterPosts(posts: RawPost[]): Promise<FilteredPost[]> {
  const results: FilteredPost[] = [];

  const candidates = posts.filter(cheapPreFilter);
  console.log(`[PreFilter] ${candidates.length}/${posts.length} passed keyword check`);

  const texts = candidates.map((post) => `${post.title} ${post.body}`.trim());
  const postVectors = await embedBatch(texts, 5);

  for (let i = 0; i < candidates.length; i++) {
    const post = candidates[i];
    const postVector = postVectors[i];

    const rankedMatches = rankAnchorMatches(postVector);
    const matches = findMatches(postVector);
    const topMatches = rankedMatches.slice(0, 3);
    const topScore = topMatches[0]?.score ?? 0;
    const titlePreview =
      post.title.length > 90
        ? `${post.title.slice(0, 90).trim()}...`
        : post.title;

    console.log(
      `[EmbeddingFilter] ${matches.length > 0 ? "PASS" : "FAIL"} score=${topScore.toFixed(3)} threshold=${EMBEDDING_CONFIG.threshold.toFixed(2)} title="${titlePreview}"`
    );
    console.log(
      `[EmbeddingFilter] Top matches: ${
        topMatches.length > 0 ? topMatches.map(formatMatch).join(" | ") : "none"
      }`
    );

    if (matches.length > 0) {
      results.push({
        ...post,
        matches,
        topCategory: matches[0].category,
        topScore: matches[0].score,
        vector: postVector,
      });
    }
  }

  console.log(`Filter complete - ${results.length}/${posts.length} posts passed`);
  return results;
}