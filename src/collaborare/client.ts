import type { ProblemDetail, ProblemListPayload, ProblemSummary } from './types';

export const PROBLEM_LIST_CACHE_KEY = 'collab.problems.list';
export const PROBLEM_LIST_TTL_MS = 10 * 60 * 1000;

export interface ProblemCache {
  read(key: string): string | null;
  write(key: string, value: string): void;
}

export interface CachedProblemList {
  readonly fetchedAt: string;
  readonly storedAt: number;
  readonly problems: ProblemSummary[];
}

export interface LoadedProblemList {
  readonly problems: readonly ProblemSummary[];
  readonly fetchedAt: string;
  readonly stale: boolean;
}

interface CacheEnvelope {
  readonly storedAt?: unknown;
  readonly payload?: unknown;
}

function stripSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

export function problemsApiUrl(signalingUrl: string, slug?: string): string {
  const base = `${stripSlash(signalingUrl)}/api/problems`;
  return slug ? `${base}/${encodeURIComponent(slug)}` : base;
}

export function memoryProblemCache(store = new Map<string, string>()): ProblemCache {
  return {
    read: (key) => store.get(key) ?? null,
    write: (key, value) => {
      store.set(key, value);
    },
  };
}

/** Browser cache. Missing storage (tests, native without a window) is a no-op. */
export function browserProblemCache(): ProblemCache {
  return {
    read(key) {
      try {
        return globalThis.localStorage?.getItem(key) ?? null;
      } catch {
        return null;
      }
    },
    write(key, value) {
      try {
        globalThis.localStorage?.setItem(key, value);
      } catch {
        return;
      }
    },
  };
}

function isSummary(value: unknown): value is ProblemSummary {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const row = value as Partial<ProblemSummary>;
  return typeof row.slug === 'string' && row.slug !== '' && typeof row.title === 'string';
}

export function parseCachedList(raw: string | null): CachedProblemList | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as CacheEnvelope;
    const payload = parsed.payload as Partial<ProblemListPayload> | undefined;
    const storedAt = parsed.storedAt;
    if (
      typeof storedAt !== 'number' ||
      !payload ||
      typeof payload.fetchedAt !== 'string' ||
      !Array.isArray(payload.problems)
    ) {
      return null;
    }
    return {
      fetchedAt: payload.fetchedAt,
      storedAt,
      problems: payload.problems.filter(isSummary),
    };
  } catch {
    return null;
  }
}

function isFresh(cached: CachedProblemList, now: number, ttlMs: number): boolean {
  return now - cached.storedAt <= ttlMs;
}

async function readJson(response: Response): Promise<unknown> {
  return response.json() as Promise<unknown>;
}

export async function fetchProblemList(options: {
  signalingUrl: string;
  fetchImpl?: typeof fetch;
  cache?: ProblemCache;
  now?: number;
  ttlMs?: number;
}): Promise<LoadedProblemList> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const cache = options.cache ?? browserProblemCache();
  const now = options.now ?? Date.now();
  const ttlMs = options.ttlMs ?? PROBLEM_LIST_TTL_MS;
  const cached = parseCachedList(cache.read(PROBLEM_LIST_CACHE_KEY));
  if (cached && isFresh(cached, now, ttlMs)) {
    return { problems: cached.problems, fetchedAt: cached.fetchedAt, stale: false };
  }
  try {
    const response = await fetchImpl(problemsApiUrl(options.signalingUrl));
    if (!response.ok) {
      throw new Error(`problem list answered ${response.status}`);
    }
    const body = (await readJson(response)) as Partial<ProblemListPayload>;
    if (!Array.isArray(body.problems) || typeof body.fetchedAt !== 'string') {
      throw new Error('problem list was not a catalog');
    }
    const problems = body.problems.filter(isSummary);
    const payload: ProblemListPayload = {
      source: 'https://collaborare.ro',
      fetchedAt: body.fetchedAt,
      problems,
    };
    cache.write(PROBLEM_LIST_CACHE_KEY, JSON.stringify({ storedAt: now, payload }));
    return { problems, fetchedAt: body.fetchedAt, stale: false };
  } catch (cause) {
    if (cached && cached.problems.length > 0) {
      return { problems: cached.problems, fetchedAt: cached.fetchedAt, stale: true };
    }
    throw cause;
  }
}

function isDetail(value: unknown): value is ProblemDetail {
  return isSummary(value) && typeof (value as ProblemDetail).statement === 'string';
}

export async function fetchProblemDetail(options: {
  signalingUrl: string;
  slug: string;
  fetchImpl?: typeof fetch;
  cache?: ProblemCache;
  now?: number;
  ttlMs?: number;
}): Promise<ProblemDetail> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const cache = options.cache ?? browserProblemCache();
  const now = options.now ?? Date.now();
  const ttlMs = options.ttlMs ?? PROBLEM_LIST_TTL_MS;
  const key = `${PROBLEM_LIST_CACHE_KEY}.${options.slug}`;
  const cached = parseCachedList(cache.read(key));
  const cachedDetail = cached?.problems[0];
  if (cached && cachedDetail && isDetail(cachedDetail) && isFresh(cached, now, ttlMs)) {
    return cachedDetail;
  }
  try {
    const response = await fetchImpl(problemsApiUrl(options.signalingUrl, options.slug));
    if (!response.ok) {
      throw new Error(`problem answered ${response.status}`);
    }
    const body = await readJson(response);
    if (!isDetail(body)) {
      throw new Error('problem was not a statement');
    }
    cache.write(
      key,
      JSON.stringify({
        storedAt: now,
        payload: {
          source: 'https://collaborare.ro',
          fetchedAt: new Date(now).toISOString(),
          problems: [body],
        },
      }),
    );
    return body;
  } catch (cause) {
    if (cachedDetail && isDetail(cachedDetail)) {
      return cachedDetail;
    }
    throw cause;
  }
}
