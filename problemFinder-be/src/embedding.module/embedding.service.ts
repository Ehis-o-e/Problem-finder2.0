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

let embedder: any = null;
let cachedAnchors: CachedAnchor[] = [];
let isReady = false;

async function getEmbedder() {
  if (embedder) return embedder;

  const { pipeline } = await import("@xenova/transformers");
  embedder = await pipeline("feature-extraction", EMBEDDING_CONFIG.model);

  console.log(`Embedding model loaded: ${EMBEDDING_CONFIG.model}`);
  return embedder;
}

export async function embed(text: string): Promise<number[]> {
  const model = await getEmbedder();
  const output = await model(text, { pooling: "mean", normalize: true });
  return Array.from(output.data) as number[];
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
