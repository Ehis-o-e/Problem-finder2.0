import axios, { AxiosResponse } from "axios";
import { RawPost } from "../filter.module/filter.service";

const REDDIT_TOKEN_URL = "https://www.reddit.com/api/v1/access_token";
const REDDIT_BASE_URL = "https://oauth.reddit.com";
const POSTS_PER_PAGE = 20;
const MAX_PAGES = 4;
const DELAY_BETWEEN_SUBREDDITS_MS = 1000;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

let cachedToken: string | null = null;
let tokenExpiresAt: number = 0;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getAccessToken(): Promise<string> {
  const now = Date.now();

  if (cachedToken && now < tokenExpiresAt) {
    return cachedToken;
  }

  const response: AxiosResponse<any> = await axios.post(
    REDDIT_TOKEN_URL,
    "grant_type=client_credentials",
    {
      auth: {
        username: process.env.REDDIT_CLIENT_ID!,
        password: process.env.REDDIT_CLIENT_SECRET!,
      },
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": process.env.REDDIT_USER_AGENT!,
      },
    }
  );

  cachedToken = response.data.access_token;
  tokenExpiresAt = Date.now() + (response.data.expires_in - 60) * 1000;

  return cachedToken!;
}

async function fetchFromSubreddit(
  subreddit: string,
  token: string
): Promise<RawPost[]> {
  const posts: RawPost[] = [];
  let after: string | null = null;
  let page = 0;

  while (page < MAX_PAGES) {
    const url = `${REDDIT_BASE_URL}/r/${subreddit}/hot`;

    const response: AxiosResponse<any> = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": process.env.REDDIT_USER_AGENT!,
      },
      params: {
        limit: POSTS_PER_PAGE,
        after: after ?? undefined,
      },
    });

    const children = response.data?.data?.children ?? [];

    if (children.length === 0) break;

    for (const child of children) {
      const post = child.data;

      if (post.stickied) continue;
      if (post.score < 5 || post.num_comments < 1) continue;

      posts.push({
        id: post.id,
        title: post.title,
        body: post.selftext ?? "",
        upvotes: post.score,
        commentCount: post.num_comments,
        url: `https://www.reddit.com${post.permalink}`,
        redditPostId: post.id,
        subreddit: post.subreddit_name_prefixed ?? subreddit,
      });
    }

    after = response.data?.data?.after ?? null;
    if (!after) break;

    page++;
  }

  return posts;
}

async function fetchWithRetry(
  subreddit: string,
  token: string,
  attempt: number = 1
): Promise<RawPost[]> {
  try {
    return await fetchFromSubreddit(subreddit, token);
  } catch (error: any) {
    if (error.response?.status === 429) {
      const retryAfter = error.response.headers["retry-after"];
      const waitMs = retryAfter ? parseInt(retryAfter) * 1000 : RETRY_DELAY_MS;

      console.warn(
        `Rate limited on r/${subreddit}. Waiting ${waitMs}ms before retry ${attempt}/${MAX_RETRIES}`
      );

      await delay(waitMs);
    }

    if (attempt < MAX_RETRIES) {
      console.warn(
        `Retrying r/${subreddit} — attempt ${attempt + 1}/${MAX_RETRIES}`
      );
      return fetchWithRetry(subreddit, token, attempt + 1);
    }

    console.error(
      `All ${MAX_RETRIES} attempts failed for r/${subreddit}: ${error.message}`
    );
    return [];
  }
}

async function fetchFromAllSubreddits(
  subreddits: string[],
  token: string
): Promise<RawPost[]> {
  const allPosts: RawPost[] = [];

  for (const subreddit of subreddits) {
    const posts = await fetchWithRetry(subreddit, token);
    allPosts.push(...posts);

    console.log(`Fetched ${posts.length} posts from r/${subreddit}`);
    await delay(DELAY_BETWEEN_SUBREDDITS_MS);
  }

  return allPosts;
}

export async function fetchPosts(subreddits: string[]): Promise<RawPost[]> {
  const token = await getAccessToken();
  const posts = await fetchFromAllSubreddits(subreddits, token);
  return posts;
}