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

export async function embed(text: string, retry = true): Promise<number[]> {
  const response = await fetch(
    "https://router.huggingface.co/hf-inference/models/sentence-transformers/all-MiniLM-L6-v2/pipeline/feature-extraction",
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.HF_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ inputs: text }),
    }
  );

  if (response.status === 503 && retry) {
    console.log("[Embedding] Model warming up, retrying in 10s...");
    await new Promise(r => setTimeout(r, 10000));
    return embed(text, false);
  }

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`HuggingFace API error ${response.status}: ${err}`);
  }

  const data = await response.json() as number[][];
  return data[0];
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function initEmbeddings(): Promise<void> {
  if (isReady) return;

  console.log("Pre-embedding anchors...");

  for (const anchor of FLAT_ANCHORS) {
    const vector = await embed(anchor.text);
    cachedAnchors.push({ ...anchor, vector });
  }

  isReady = true;
  console.log(`${cachedAnchors.length} anchors cached`);
}

export function rankAnchorMatches(postVector: number[]): AnchorMatch[] {
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

export function findMatches(postVector: number[]): AnchorMatch[] {
  return rankAnchorMatches(postVector).filter(
    (match) => match.score >= EMBEDDING_CONFIG.threshold
  );
}

export async function embedBatch(texts: string[], chunkSize = 20): Promise<number[][]> {
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += chunkSize) {
    const chunk = texts.slice(i, i + chunkSize);
    const vectors = await Promise.all(chunk.map((t) => embed(t)));
    results.push(...vectors);

    if (i + chunkSize < texts.length) {
      await new Promise(r => setTimeout(r, 10));
    }
  }

  return results;
}