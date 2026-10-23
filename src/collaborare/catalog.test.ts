import { describe, expect, it } from 'vitest';
import { fetchProblemDetail, fetchProblemList, memoryProblemCache, problemsApiUrl } from './client';
import {
  CATEGORY_OLYMPIAD,
  CATEGORY_SEQUENCES,
  CATEGORY_START_9_10,
  filterProblems,
  formatMemoryLimit,
  formatTimeLimit,
  problemCategories,
} from './filter';
import { detailFromRow, summaryFromRow } from './map';
import { formulasInStatement, imagesInStatement } from './statement';
import type { ProblemSummary } from './types';

const row = (patch: Partial<ProblemSummary> = {}): ProblemSummary => ({
  slug: 'bucati',
  title: 'Bucăți crescătoare',
  source: 'Secvențe (antrenament)',
  topic: 'secvențe',
  category: 'oji',
  timeLimitMs: 300,
  memoryLimitKb: 65536,
  testsCount: 20,
  difficulty: 1,
  olympGrade: null,
  olympLevel: null,
  ...patch,
});

describe('catalog mapping', () => {
  it('keeps a real test count and drops a missing one', () => {
    expect(summaryFromRow({ slug: 'a', title: 'A', tests_count: 12 })?.testsCount).toBe(12);
    expect(summaryFromRow({ slug: 'a', title: 'A' })?.testsCount).toBeNull();
    expect(summaryFromRow({ title: 'A' })).toBeNull();
  });

  it('keeps examples, images and formulas on the statement', () => {
    const detail = detailFromRow({
      slug: 'suma',
      title: 'Suma',
      statement: 'Calculează $a+b$ și $$c^2$$.\n\n![desen](/img/a.png)',
      examples: [{ input: '1\n', output: '1\n', explanation: 'unul' }, { input: 1 }],
      time_limit_ms: 2000,
      memory_limit_kb: 262144,
    });
    expect(detail?.examples).toEqual([{ input: '1\n', output: '1\n', explanation: 'unul' }]);
    expect(detail?.images).toEqual([{ alt: 'desen', url: 'https://collaborare.ro/img/a.png' }]);
    expect(detail?.formulas).toEqual(['c^2', 'a+b']);
    expect(detail?.url).toBe('https://collaborare.ro/probleme/suma');
    expect(detail?.timeLimitMs).toBe(2000);
  });

  it('reads an html image and ignores a broken one', () => {
    expect(imagesInStatement('<img alt="fig" src="https://cdn.example/a.png">')).toEqual([
      { alt: 'fig', url: 'https://cdn.example/a.png' },
    ]);
    expect(formulasInStatement('no math')).toEqual([]);
  });
});

describe('the same categories as collaborare.ro', () => {
  const problems = [
    row({
      slug: 'v',
      title: 'Vectori max',
      topic: 'Vectori',
      category: 'start-9-10',
      source: 'Pregătire IX–X',
    }),
    row({
      slug: 'oji',
      title: 'Alegeri',
      topic: 'Subiecte oficiale OJI 2026',
      category: 'official-oji-2026',
      olympGrade: 9,
      olympLevel: 'oji',
      source: 'OJI 2026',
    }),
    row({ slug: 'seq', title: 'Pare', topic: 'secvențe', source: 'Secvențe (antrenament)' }),
    row({ slug: 'bac', title: 'Bac', category: 'bac', topic: 'Grafuri' }),
    row({
      slug: 'graf',
      title: 'Graf',
      topic: 'Grafuri',
      category: 'start-11-12',
      source: 'Pregătire XI–XII',
    }),
  ];

  it('builds the collection chips and then the topics, without bac', () => {
    expect(problemCategories(problems).map((chip) => chip.label)).toEqual([
      'Toate problemele',
      'Olimpiada de informatică (cls. V–XII)',
      'Pregătire clasa IX–X',
      'Pregătire clasa XI–XII',
      'Antrenament secvențe',
      'Vectori',
      'Subiecte oficiale OJI 2026',
      'secvențe',
      'Grafuri',
    ]);
  });

  it('filters by search, topic, collection and olympiad grade', () => {
    expect(
      filterProblems(problems, { text: 'vector', category: '' }).map((item) => item.slug),
    ).toEqual(['v']);
    expect(
      filterProblems(problems, { text: '', category: 'Grafuri' }).map((item) => item.slug),
    ).toEqual(['graf']);
    expect(
      filterProblems(problems, { text: '', category: CATEGORY_START_9_10 }).map(
        (item) => item.slug,
      ),
    ).toEqual(['v']);
    expect(
      filterProblems(problems, { text: '', category: CATEGORY_SEQUENCES }).map((item) => item.slug),
    ).toEqual(['seq']);
    expect(
      filterProblems(problems, { text: '', category: CATEGORY_OLYMPIAD, olympGrade: 9 }).map(
        (item) => item.slug,
      ),
    ).toEqual(['oji']);
    expect(filterProblems(problems, { text: 'bac', category: '' })).toEqual([]);
  });

  it('formats the limits the catalog actually stores', () => {
    expect(formatTimeLimit(300)).toBe('0.3 s');
    expect(formatTimeLimit(2000)).toBe('2 s');
    expect(formatTimeLimit(null)).toBeNull();
    expect(formatMemoryLimit(65536)).toBe('64 MB');
    expect(formatMemoryLimit(null)).toBeNull();
  });
});

describe('problem API client', () => {
  const listBody = {
    source: 'https://collaborare.ro',
    fetchedAt: '2026-10-23T10:00:00.000Z',
    problems: [row()],
  };

  it('points at the signaling JSON API', () => {
    expect(problemsApiUrl('https://collab-signaling.onrender.com/')).toBe(
      'https://collab-signaling.onrender.com/api/problems',
    );
    expect(problemsApiUrl('http://localhost:4000', 'a b')).toBe(
      'http://localhost:4000/api/problems/a%20b',
    );
  });

  it('caches a list and serves it again without another request', async () => {
    const cache = memoryProblemCache();
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return new Response(JSON.stringify(listBody), { status: 200 });
    };
    const first = await fetchProblemList({
      signalingUrl: 'http://localhost:4000',
      fetchImpl,
      cache,
      now: 1_000,
    });
    const second = await fetchProblemList({
      signalingUrl: 'http://localhost:4000',
      fetchImpl,
      cache,
      now: 2_000,
    });
    expect(first.problems).toHaveLength(1);
    expect(second.stale).toBe(false);
    expect(calls).toBe(1);
  });

  it('returns the last list when the API is down', async () => {
    const cache = memoryProblemCache();
    await fetchProblemList({
      signalingUrl: 'http://localhost:4000',
      fetchImpl: async () => new Response(JSON.stringify(listBody), { status: 200 }),
      cache,
      now: 0,
      ttlMs: 10,
    });
    const stale = await fetchProblemList({
      signalingUrl: 'http://localhost:4000',
      fetchImpl: async () => {
        throw new Error('offline');
      },
      cache,
      now: 50,
      ttlMs: 10,
    });
    expect(stale.stale).toBe(true);
    expect(stale.problems[0]?.slug).toBe('bucati');
  });

  it('fails when there is no cache and the API is down', async () => {
    await expect(
      fetchProblemList({
        signalingUrl: 'http://localhost:4000',
        fetchImpl: async () => new Response('no', { status: 503 }),
        cache: memoryProblemCache(),
      }),
    ).rejects.toThrow(/503/);
  });

  it('loads one statement and caches it', async () => {
    const cache = memoryProblemCache();
    let calls = 0;
    const detail = {
      ...row(),
      statement: 'Enunț',
      inputFormat: 'n',
      outputFormat: 'n',
      constraints: '',
      hint: '',
      examples: [{ input: '1\n', output: '1\n' }],
      images: [],
      formulas: [],
      url: 'https://collaborare.ro/probleme/bucati',
    };
    const fetchImpl = async () => {
      calls += 1;
      return new Response(JSON.stringify(detail), { status: 200 });
    };
    const loaded = await fetchProblemDetail({
      signalingUrl: 'http://localhost:4000',
      slug: 'bucati',
      fetchImpl,
      cache,
      now: 5,
    });
    await fetchProblemDetail({
      signalingUrl: 'http://localhost:4000',
      slug: 'bucati',
      fetchImpl,
      cache,
      now: 6,
    });
    expect(loaded.statement).toBe('Enunț');
    expect(calls).toBe(1);
  });
});
