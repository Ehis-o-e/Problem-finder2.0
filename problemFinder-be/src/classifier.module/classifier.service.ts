import { FilteredPost } from "../filter.module/filter.service";
import { QueryParserResult } from "../queryParser.module/queryParser.service";
import { embed, cosineSimilarity } from "../embedding.module/embedding.service";

export interface ClassifiedPost extends FilteredPost {
  category: string;
  confidenceScore: number;
  relevanceReason: string;
}

const CLASSIFIER_THRESHOLD = 0.2  ;

function previewTitle(title: string): string {
  return title.length > 90 ? `${title.slice(0, 90).trim()}...` : title;
}

async function scorePost(
  post: FilteredPost,
  topicVector: number[]
): Promise<{ score: number; reason: string }> {

  const score = parseFloat(
    cosineSimilarity(post.vector, topicVector).toFixed(2)
  );

  const reason =
    score >= 0.5
      ? "strong match with topic"
      : score >= 0.35
        ? "moderate match with topic"
        : "weak match with topic";

  return { score, reason };
}

export async function classifyPosts(
  posts: FilteredPost[],
  parsed: QueryParserResult
): Promise<ClassifiedPost[]> {
  const topicVector = await embed(parsed.originalQuery);

  const scored = await Promise.all(
    posts.map(async (post) => {
      const { score, reason } = await scorePost(post, topicVector);
      const classifierResult: ClassifiedPost = {
        ...post,
        category: parsed.category,
        confidenceScore: score,
        relevanceReason: reason,
      };

      console.log(
        `[Classifier] ${score > CLASSIFIER_THRESHOLD ? "PASS" : "FAIL"} score=${score.toFixed(2)} threshold=${CLASSIFIER_THRESHOLD.toFixed(2)} title="${previewTitle(post.title)}"`
      );
      console.log(`[Classifier] Reason: ${reason}`);

      return classifierResult;
    })
  );

  const kept = scored
    .filter((post) => post.confidenceScore > CLASSIFIER_THRESHOLD)
    .sort((a, b) => b.confidenceScore - a.confidenceScore);

  const rejected = scored
    .filter((post) => post.confidenceScore <= CLASSIFIER_THRESHOLD)
    .sort((a, b) => b.confidenceScore - a.confidenceScore);

  const averageScore =
    scored.length > 0
      ? (
          scored.reduce((sum, post) => sum + post.confidenceScore, 0) /
          scored.length
        ).toFixed(2)
      : "0.00";

  console.log(
    `[Classifier] Complete - kept ${kept.length}/${scored.length} posts, rejected ${rejected.length}, average score=${averageScore}, threshold=${CLASSIFIER_THRESHOLD.toFixed(2)}`
  );

  if (rejected.length > 0) {
    const topRejected = rejected.slice(0, 5).map((post) => ({
      score: post.confidenceScore,
      title: previewTitle(post.title),
      reason: post.relevanceReason,
    }));

    console.log(
      `[Classifier] Highest-scoring rejected posts: ${JSON.stringify(topRejected)}`
    );
  }

  return kept;
}
