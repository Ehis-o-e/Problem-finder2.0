import { EMBEDDING_CONFIG, FLAT_ANCHORS } from "../config/embedding.config";

interface CachedAnchor {
  text: string;
  category: string;
  vector: number[];
}

export interface AnchorMatch {
  category: string;
  anchor: string;
  score: number;
}

let cachedAnchors: CachedAnchor[] = [];
let isReady = false;

/* -------------------------------------------------- */
/* 🔹 Utility: Sleep */
/* -------------------------------------------------- */
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* -------------------------------------------------- */
/* 🔹 Extract embedding safely (handles HF weirdness) */
/* -------------------------------------------------- */
function extractEmbedding(data: unknown): number[] {
  if (!Array.isArray(data)) {
    throw new Error("Invalid embedding response: not an array");
  }

  // Case 0: flat array [0.1, 0.2, ...]
  if (typeof data[0] === "number") {
    return data as number[];
  }

  // Case 1: [[...]]
  if (
    Array.isArray(data[0]) &&
    data[0].every((x) => typeof x === "number")
  ) {
    return data[0] as number[];
  }

  // Case 2: [[[...]]]
  if (
    Array.isArray(data[0]) &&
    Array.isArray(data[0][0]) &&
    data[0][0].every((x) => typeof x === "number")
  ) {
    return data[0][0] as number[];
  }

  console.error("HF RAW RESPONSE:", JSON.stringify(data).slice(0, 300));
  throw new Error("Invalid embedding shape from HuggingFace");
}

/* -------------------------------------------------- */
/* 🔹 Embed single text */
/* -------------------------------------------------- */
export async function embed(
  text: string,
  attempt = 1
): Promise<number[]> {
  try {
    const response = await fetch(
      "https://router.huggingface.co/hf-inference/models/sentence-transformers/all-MiniLM-L6-v2/pipeline/feature-extraction",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.HF_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ inputs: text }),
      }
    );

    // 🔁 Retry if model warming up
    if (response.status === 503 && attempt <= 3) {
      const delay = 5000 * attempt;
      console.log(`[Embedding] Model warming up... retrying in ${delay}ms`);
      await sleep(delay);
      return embed(text, attempt + 1);
    }

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`HF API ${response.status}: ${err}`);
    }

    const data: unknown = await response.json();
    return extractEmbedding(data);
  } catch (err) {
    if (attempt <= 3) {
      const delay = 3000 * attempt;
      console.log(`[Embedding] Retry ${attempt} after error...`);
      await sleep(delay);
      return embed(text, attempt + 1);
    }

    throw err;
  }
}

/* -------------------------------------------------- */
/* 🔹 Cosine similarity (safe) */
/* -------------------------------------------------- */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error("Vector size mismatch");
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/* -------------------------------------------------- */
/* 🔹 Batch embedding */
/* -------------------------------------------------- */
export async function embedBatch(
  texts: string[],
  chunkSize = 10
): Promise<number[][]> {
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += chunkSize) {
    const chunk = texts.slice(i, i + chunkSize);

    const vectors = await Promise.all(
      chunk.map((text) => embed(text))
    );

    results.push(...vectors);

    if (i + chunkSize < texts.length) {
      await sleep(100);
    }
  }

  return results;
}

/* -------------------------------------------------- */
/* 🔹 Initialize embeddings (fast + safe) */
/* -------------------------------------------------- */
export async function initEmbeddings(): Promise<void> {
  if (isReady) return;

  console.log("Pre-embedding anchors...");

  try {
    const texts = FLAT_ANCHORS.map((a) => a.text);
    const vectors = await embedBatch(texts);

    cachedAnchors = FLAT_ANCHORS.map((anchor, i) => ({
      ...anchor,
      vector: vectors[i],
    }));

    isReady = true;
    console.log(`✅ ${cachedAnchors.length} anchors cached`);
  } catch (err) {
    console.error("❌ Failed to initialize embeddings:", err);
    throw err;
  }
}

/* -------------------------------------------------- */
/* 🔹 Rank matches */
/* -------------------------------------------------- */
export function rankAnchorMatches(
  postVector: number[]
): AnchorMatch[] {
  if (!isReady) {
    throw new Error("Embeddings not initialised - call initEmbeddings() first");
  }

  return cachedAnchors
    .map((anchor) => ({
      category: anchor.category,
      anchor: anchor.text,
      score: cosineSimilarity(postVector, anchor.vector),
    }))
    .sort((a, b) => b.score - a.score);
}

/* -------------------------------------------------- */
/* 🔹 Filter matches */
/* -------------------------------------------------- */
export function findMatches(
  postVector: number[]
): AnchorMatch[] {
  return rankAnchorMatches(postVector).filter(
    (match) => match.score >= EMBEDDING_CONFIG.threshold
  );
}