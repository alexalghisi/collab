import { describe, expect, it } from 'vitest';
import { createHashEmbedder, createOpenAiEmbedder } from './embed';

describe('createHashEmbedder', () => {
  it('is deterministic and unit-length', async () => {
    const embedder = createHashEmbedder(16);
    const [first] = await embedder.embed(['the billing queue']);
    const [again] = await embedder.embed(['the billing queue']);

    expect(first).toEqual(again);
    const norm = Math.sqrt(first.reduce((sum, value) => sum + value * value, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it('puts the same wording closer to itself than to an unrelated sentence', async () => {
    const embedder = createHashEmbedder(32);
    const [query, same, other] = await embedder.embed([
      'billing queue',
      'the billing queue overflowed',
      'lunch menu',
    ]);
    const near = query.reduce((sum, value, index) => sum + value * same[index], 0);
    const far = query.reduce((sum, value, index) => sum + value * other[index], 0);
    expect(near).toBeGreaterThan(far);
  });
});

describe('createOpenAiEmbedder', () => {
  it('sends the texts to the embeddings endpoint and returns the vectors', async () => {
    const fetchImpl: typeof fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as { input: string[] };
      expect(body.input).toEqual(['hello']);
      return new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2] }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };
    const embedder = createOpenAiEmbedder('sk-test', fetchImpl);
    await expect(embedder.embed(['hello'])).resolves.toEqual([[0.1, 0.2]]);
  });

  it('surfaces the provider error rather than a generic failure', async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ error: { message: 'quota exceeded' } }), { status: 429 });
    const embedder = createOpenAiEmbedder('sk-test', fetchImpl);
    await expect(embedder.embed(['hello'])).rejects.toThrow('quota exceeded');
  });
});
