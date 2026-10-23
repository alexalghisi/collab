import { readFileSync } from 'node:fs';
import { Router } from 'express';
import type { CatalogItem } from '../../src/collaborare/types';

interface CatalogFile {
  readonly source?: string;
  readonly items?: readonly CatalogItem[];
}

export function collaborareRouter(catalogPath: string): Router {
  const router = Router();
  const read = (): CatalogFile => JSON.parse(readFileSync(catalogPath, 'utf8')) as CatalogFile;

  router.get('/collaborare/catalog', (_req, res) => {
    res.type('json').send(readFileSync(catalogPath));
  });

  router.get('/collaborare/problems/:slug', (req, res) => {
    const slug = req.params.slug;
    const item = (read().items ?? []).find((entry) => entry.slug === slug);
    if (!item) {
      res.status(404).json({ error: 'Unknown problem.' });
      return;
    }
    res.json(item);
  });

  return router;
}
