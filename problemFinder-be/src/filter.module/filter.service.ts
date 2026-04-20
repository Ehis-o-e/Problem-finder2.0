import { signalSet } from "./filter.vocabulary";

export interface RawPost {
  id: string;
  title: string;
  body: string;
  upvotes: number;
  commentCount: number;
  url: string;
  redditPostId: string;
  subreddit: string;
}

export interface FilteredPost extends RawPost {
  matchedSignals: string[];
}

export function filterPosts(posts: RawPost[]): FilteredPost[] {
  const results: FilteredPost[] = [];

  for (const post of posts) {
    const normalised = `${post.title} ${post.body}`.toLowerCase().trim();
    const matchedSignals: string[] = [];

    for (const signal of signalSet) {
      if (normalised.includes(signal)) {
        matchedSignals.push(signal);
      }
    }

    if (matchedSignals.length > 0) {
      results.push({
        ...post,
        matchedSignals,
      });
    }
  }

  return results;
}