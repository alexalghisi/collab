import { DEFAULT_EMBEDDING_DIMENSIONS, type Embedder } from './VectorStore';

/**
 * Deterministic hashing embedder used when no hosted model is configured,
 * and in tests. Nearby wording is not as close as a real model would put it,
 * but the same sentence always lands on the same vector, which is what the
 * store and the eval harness need.
 */
export function createHashEmbedder(dimensions = DEFAULT_EMBEDDING_DIMENSIONS): Embedder {
  return {
    dimensions,
    async embed(texts) {
      return texts.map((text) => hashVector(text, dimensions));
    },
  };
}

function hashVector(text: string, dimensions: number): number[] {
  const vector = new Array<number>(dimensions).fill(0);
  const tokens = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  for (const token of tokens) {
    vector[fnv1a(token) % dimensions] += 1;
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (norm === 0) {
    return vector;
  }
  return vector.map((value) => value / norm);
}

function fnv1a(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * OpenAI text-embedding-3-small, used when OPENAI_API_KEY is set. The rest
 * of the pipeline only sees `Embedder`.
 */
export function createOpenAiEmbedder(apiKey: string, fetchImpl: typeof fetch = fetch): Embedder {
  return {
    dimensions: 1536,
    async embed(texts) {
      const response = await fetchImpl('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ model: 'text-embedding-3-small', input: texts }),
      });
      const body = (await response.json()) as {
        data?: Array<{ embedding: number[] }>;
        error?: { message?: string };
      };
      if (!response.ok || !body.data) {
        throw new Error(body.error?.message ?? `Embedding request failed (${response.status}).`);
      }
      return body.data.map((entry) => entry.embedding);
    },
  };
}

export function createEmbedderFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): Embedder {
  const key = env.OPENAI_API_KEY?.trim();
  return key ? createOpenAiEmbedder(key, fetchImpl) : createHashEmbedder();
}
