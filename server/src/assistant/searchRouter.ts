import { Router } from 'express';
import { createEmbedderFromEnv, createHashEmbedder } from '../../../src/search/embed';
import type { VectorStore } from '../../../src/search/VectorStore';

export function searchRouter(store: VectorStore): Router {
  const router = Router();
  const embedder = process.env.OPENAI_API_KEY ? createEmbedderFromEnv() : createHashEmbedder();

  router.get('/search', async (request, response) => {
    const query = typeof request.query.q === 'string' ? request.query.q.trim() : '';
    const meetingId =
      typeof request.query.meetingId === 'string' ? request.query.meetingId.trim() : undefined;
    if (query === '') {
      response.status(400).json({ error: 'Enter something to search for.' });
      return;
    }
    try {
      const [embedding] = await embedder.embed([query]);
      const hits = await store.query(embedding, { meetingId: meetingId || undefined, limit: 12 });
      response.json({ hits });
    } catch (cause) {
      response.status(502).json({ error: (cause as Error).message });
    }
  });

  return router;
}
