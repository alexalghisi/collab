import { once } from 'node:events';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import cors from 'cors';
import express from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import { problemsCors } from './cors';
import { problemsRouter } from './router';
import { CATALOG_PAGE_SIZE, createProblemCatalog, type ProblemCatalog } from './source';

const summaryRow = {
  slug: 'bucati',
  title: 'Bucăți crescătoare',
  source: 'Secvențe (antrenament)',
  topic: 'secvențe',
  category: 'oji',
  time_limit_ms: 300,
  memory_limit_kb: 65536,
  tests_count: 15,
  difficulty: 1,
  olymp_grade: null,
  olymp_level: null,
};

describe('catalog source', () => {
  it('maps the public catalog and reuses the cached list', async () => {
    let calls = 0;
    const fetchImpl = async (input: RequestInfo | URL) => {
      calls += 1;
      const url = String(input);
      if (url.includes('slug=eq.')) {
        return new Response(
          JSON.stringify([
            {
              ...summaryRow,
              statement: 'Enunț $n$',
              input_format: 'n',
              output_format: 'bucăți',
              constraints: '',
              hint: '',
              examples: [{ input: '7\n', output: '3\n' }],
            },
          ]),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify([summaryRow, { title: 'skip me' }]), { status: 200 });
    };
    const catalog = createProblemCatalog({
      fetchImpl,
      now: () => 1_000,
      ttlMs: 50,
      url: 'https://catalog.test',
      key: 'test-key',
    });
    const first = await catalog.list();
    const second = await catalog.list();
    const detail = await catalog.detail('bucati');
    expect(first.problems).toEqual([
      expect.objectContaining({
        slug: 'bucati',
        testsCount: 15,
        timeLimitMs: 300,
        memoryLimitKb: 65536,
      }),
    ]);
    expect(second.fetchedAt).toBe(first.fetchedAt);
    expect(detail?.examples).toEqual([{ input: '7\n', output: '3\n' }]);
    expect(detail?.formulas).toEqual(['n']);
    expect(detail?.url).toBe('https://collaborare.ro/probleme/bucati');
    expect(calls).toBe(2);
    expect(await catalog.detail('Not A Slug')).toBeNull();
  });

  it('reads every page of a catalog larger than one response', async () => {
    const total = CATALOG_PAGE_SIZE + 159;
    const all = Array.from({ length: total }, (_, index) => ({
      ...summaryRow,
      slug: `problem-${index}`,
      title: `Problem ${index}`,
    }));
    const offsets: number[] = [];
    const fetchImpl = async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const offset = Number(url.searchParams.get('offset'));
      const limit = Number(url.searchParams.get('limit'));
      offsets.push(offset);
      expect(url.searchParams.get('order')).toBe('difficulty.asc,title.asc,slug.asc');
      return new Response(
        JSON.stringify(all.slice(offset, offset + Math.min(limit, CATALOG_PAGE_SIZE))),
        { status: 200 },
      );
    };
    const catalog = createProblemCatalog({
      fetchImpl,
      now: () => 1_000,
      url: 'https://catalog.test',
      key: 'test-key',
    });
    const { problems } = await catalog.list();
    expect(problems).toHaveLength(total);
    expect(problems.at(-1)?.slug).toBe(`problem-${total - 1}`);
    expect(offsets).toEqual([0, CATALOG_PAGE_SIZE]);
  });

  it('serves local rows after the public catalog, which wins on a shared slug', async () => {
    let calls = 0;
    const fetchImpl = async (input: RequestInfo | URL) => {
      calls += 1;
      const url = String(input);
      if (url.includes('slug=eq.bucati')) {
        return new Response(
          JSON.stringify([
            {
              ...summaryRow,
              statement: 'Enunțul de pe colaborare.ro',
              input_format: 'Pe prima linie: n.',
              constraints: '1 ≤ n ≤ 300',
            },
          ]),
          { status: 200 },
        );
      }
      if (url.includes('slug=eq.')) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      return new Response(JSON.stringify([summaryRow]), { status: 200 });
    };
    const catalog = createProblemCatalog({
      fetchImpl,
      url: 'https://catalog.test',
      key: 'test-key',
      localRows: [
        {
          ...summaryRow,
          title: 'Local duplicate',
          statement: 'Enunț local, mai scurt.',
        },
        {
          ...summaryRow,
          slug: 'rec-factorial',
          title: 'Factorialul',
          statement: 'Calculează $n!$',
        },
      ],
    });
    const { problems } = await catalog.list();
    expect(problems.map((problem) => problem.title)).toEqual(['Bucăți crescătoare', 'Factorialul']);
    expect((await catalog.detail('rec-factorial'))?.statement).toBe('Calculează $n!$');
    const shared = await catalog.detail('bucati');
    expect(shared?.title).toBe('Bucăți crescătoare');
    expect(shared?.statement).toBe('Enunțul de pe colaborare.ro');
    expect(shared?.constraints).toBe('1 ≤ n ≤ 300');
    expect((await catalog.detail('bucati'))?.statement).toBe('Enunțul de pe colaborare.ro');
    expect(calls).toBe(2);
  });

  it('uses the public statement when the statement is opened before the list', async () => {
    const fetchImpl = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('slug=eq.rec-suma-vector')) {
        return new Response(
          JSON.stringify([
            {
              ...summaryRow,
              slug: 'rec-suma-vector',
              title: 'Suma elementelor unui vector',
              statement: 'Se dă un vector cu n numere întregi.',
              constraints: '1 ≤ n ≤ 300',
            },
          ]),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify([]), { status: 200 });
    };
    const catalog = createProblemCatalog({
      fetchImpl,
      url: 'https://catalog.test',
      key: 'test-key',
      localRows: [
        {
          ...summaryRow,
          slug: 'rec-suma-vector',
          title: 'Suma elementelor unui vector',
          statement: 'Calculează recursiv suma elementelor vectorului.',
          constraints: '1 ≤ n ≤ 1000',
        },
      ],
    });
    const opened = await catalog.detail('rec-suma-vector');
    expect(opened?.statement).toBe('Se dă un vector cu n numere întregi.');
    expect(opened?.constraints).toBe('1 ≤ n ≤ 300');
  });

  it('does not cache a failed read', async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return new Response('no', { status: 500 });
    };
    const catalog = createProblemCatalog({
      fetchImpl,
      url: 'https://catalog.test',
      key: 'k',
      ttlMs: 10_000,
    });
    await expect(catalog.list()).rejects.toThrow(/500/);
    await expect(catalog.list()).rejects.toThrow(/500/);
    expect(calls).toBe(2);
  });
});

describe('problem routes', () => {
  let http: Server;
  let base: string;

  const serve = async (catalog: ProblemCatalog) => {
    const app = express();
    const open = cors({ origin: '*' });
    app.use((req, res, next) => {
      if (req.path.startsWith('/api/problems')) {
        next();
        return;
      }
      open(req, res, next);
    });
    app.use('/api/problems', problemsCors, problemsRouter(catalog));
    http = app.listen(0);
    await once(http, 'listening');
    base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  };

  afterEach(async () => {
    if (!http) {
      return;
    }
    http.close();
    await once(http, 'close');
  });

  const catalog: ProblemCatalog = {
    async list() {
      return {
        fetchedAt: '2026-10-23T12:00:00.000Z',
        problems: [
          {
            slug: 'bucati',
            title: 'Bucăți',
            source: 'Secvențe',
            topic: 'secvențe',
            category: 'oji',
            timeLimitMs: 300,
            memoryLimitKb: 65536,
            testsCount: 15,
            difficulty: 1,
            olympGrade: null,
            olympLevel: null,
          },
        ],
      };
    },
    async detail(slug) {
      if (slug !== 'bucati') {
        return null;
      }
      return {
        slug,
        title: 'Bucăți',
        source: 'Secvențe',
        topic: 'secvențe',
        category: 'oji',
        timeLimitMs: 300,
        memoryLimitKb: 65536,
        testsCount: 15,
        difficulty: 1,
        olympGrade: null,
        olympLevel: null,
        statement: 'text',
        inputFormat: 'n',
        outputFormat: 'k',
        constraints: '',
        hint: '',
        examples: [{ input: '1\n', output: '1\n' }],
        images: [],
        formulas: [],
        url: 'https://collaborare.ro/probleme/bucati',
      };
    },
  };

  it('serves the list and one statement to the pages origin', async () => {
    await serve(catalog);
    const list = await fetch(`${base}/api/problems`, {
      headers: { origin: 'https://alexalghisi.github.io' },
    });
    expect(list.status).toBe(200);
    expect(list.headers.get('access-control-allow-origin')).toBe('https://alexalghisi.github.io');
    const body = (await list.json()) as { problems: { testsCount: number }[] };
    expect(body.problems[0]?.testsCount).toBe(15);

    const one = await fetch(`${base}/api/problems/bucati`, {
      headers: { origin: 'http://localhost:8081' },
    });
    expect(one.headers.get('access-control-allow-origin')).toBe('http://localhost:8081');
    expect(await one.json()).toMatchObject({
      statement: 'text',
      examples: [{ input: '1\n', output: '1\n' }],
    });
  });

  it('hides the catalog from other web origins and answers 404 for an unknown slug', async () => {
    await serve(catalog);
    const denied = await fetch(`${base}/api/problems`, {
      headers: { origin: 'https://evil.example' },
    });
    expect(denied.headers.get('access-control-allow-origin')).toBeNull();
    expect(denied.status).toBe(200);

    const preflight = await fetch(`${base}/api/problems`, {
      method: 'OPTIONS',
      headers: { origin: 'https://evil.example' },
    });
    expect(preflight.status).toBe(403);

    const allowed = await fetch(`${base}/api/problems`, {
      method: 'OPTIONS',
      headers: { origin: 'http://127.0.0.1:4173' },
    });
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get('access-control-allow-origin')).toBe('http://127.0.0.1:4173');

    const missing = await fetch(`${base}/api/problems/no-such`);
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({
      url: 'https://collaborare.ro/probleme/no-such',
    });
  });

  it('says the catalog is down instead of inventing problems', async () => {
    await serve({
      async list() {
        throw new Error('upstream');
      },
      async detail() {
        throw new Error('upstream');
      },
    });
    const list = await fetch(`${base}/api/problems`);
    expect(list.status).toBe(503);
    expect(await list.json()).toMatchObject({ site: 'https://collaborare.ro' });
    const one = await fetch(`${base}/api/problems/bucati`);
    expect(one.status).toBe(503);
    expect(await one.json()).toMatchObject({ url: 'https://collaborare.ro/probleme/bucati' });
  });
});
