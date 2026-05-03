function parseEnvNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let nextAvailableAt = 0;

const REDDIT_MIN_REQUEST_INTERVAL_MS = parseEnvNumber(
  process.env.REDDIT_MIN_REQUEST_INTERVAL_MS,
  800
);

function getRetryAfterMs(error: unknown): number | null {
  if (
    typeof error !== "object" ||
    error === null ||
    !("response" in error) ||
    typeof (error as { response?: unknown }).response !== "object" ||
    (error as { response?: unknown }).response === null
  ) {
    return null;
  }

  const response = (error as {
    response?: {
      headers?: Record<string, string | string[] | undefined>;
      status?: number;
    };
  }).response;

  if (response?.status !== 429) {
    return null;
  }

  const retryAfterHeader = response.headers?.["retry-after"];

  if (typeof retryAfterHeader === "string") {
    const retryAfterSeconds = Number.parseInt(retryAfterHeader, 10);
    return Number.isFinite(retryAfterSeconds) ? retryAfterSeconds * 1000 : null;
  }

  return null;
}

export async function scheduleRedditRequest<T>(
  label: string,
  task: () => Promise<T>
): Promise<T> {
  const now = Date.now();
  const scheduledAt = Math.max(now, nextAvailableAt);
  nextAvailableAt = scheduledAt + REDDIT_MIN_REQUEST_INTERVAL_MS;

  const waitMs = scheduledAt - now;
  if (waitMs > 0) {
    await delay(waitMs);
  }

  try {
    return await task();
  } catch (error) {
    const retryAfterMs = getRetryAfterMs(error);

    if (retryAfterMs) {
      nextAvailableAt = Math.max(nextAvailableAt, Date.now() + retryAfterMs);
      console.warn(
        `Reddit asked us to slow down after ${label}. Backing off for ${retryAfterMs}ms.`
      );
    }

    throw error;
  }
}
