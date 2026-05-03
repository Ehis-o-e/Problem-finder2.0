import { RawPost } from "../fetch.module/fetch.service";
import {
  embed,
  findMatches,
  rankAnchorMatches,
  AnchorMatch,
} from "../embedding.module/embedding.service";
import { EMBEDDING_CONFIG } from "../config/embedding.config";

export interface FilteredPost extends RawPost {
  matches: AnchorMatch[];
  topCategory: string;
  topScore: number;
}

function formatMatch(match: AnchorMatch): string {
  return `${match.category}:${match.score.toFixed(3)} "${match.anchor}"`;
}

export async function filterPosts(posts: RawPost[]): Promise<FilteredPost[]> {
  const results: FilteredPost[] = [];

  // Batch embed all posts in parallel instead of one-by-one
  const texts = posts.map((post) => `${post.title} ${post.body}`.trim());
  const postVectors = await Promise.all(texts.map((text) => embed(text)));

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
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
      });
    }
  }

  console.log(`Filter complete - ${results.length}/${posts.length} posts passed`);
  return results;
}