import { Router } from 'express';
import { isProblemSlug } from '../../../src/collaborare/map';
import {
  COLLABORARE_SITE,
  problemPageUrl,
  type ProblemListPayload,
} from '../../../src/collaborare/types';
import type { ProblemCatalog } from './source';

export function problemsRouter(catalog: ProblemCatalog): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    try {
      const list = await catalog.list();
      const body: ProblemListPayload = {
        source: COLLABORARE_SITE,
        fetchedAt: list.fetchedAt,
        problems: list.problems,
      };
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.json(body);
    } catch (cause) {
      if (process.env.VITEST !== 'true') {
        console.error('[collab] problem list failed', cause);
      }
      res.status(503).json({
        error: 'The problem list is unavailable.',
        site: COLLABORARE_SITE,
      });
    }
  });

  router.get('/:slug', async (req, res) => {
    const slug = req.params.slug;
    if (!isProblemSlug(slug)) {
      res.status(404).json({ error: 'Unknown problem.' });
      return;
    }
    try {
      const problem = await catalog.detail(slug);
      if (!problem) {
        res.status(404).json({ error: 'Unknown problem.', url: problemPageUrl(slug) });
        return;
      }
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.json(problem);
    } catch (cause) {
      if (process.env.VITEST !== 'true') {
        console.error('[collab] problem statement failed', cause);
      }
      res.status(503).json({
        error: 'The problem statement is unavailable.',
        url: problemPageUrl(slug),
      });
    }
  });

  return router;
}
