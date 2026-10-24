import {
  detailFromRow,
  isProblemSlug,
  summaryFromRow,
  type CatalogRow,
} from '../../../src/collaborare/map';
import type { ProblemDetail, ProblemSummary } from '../../../src/collaborare/types';

/** Public catalog the collaborare.ro site itself reads. Not a service-role key. */
export const DEFAULT_CATALOG_URL = 'https://fiinesljtryrjttzacbn.supabase.co';
export const DEFAULT_CATALOG_KEY = 'sb_publishable_IvFBgLjRs62GyrZHn0aaLw_GQEdSOqU';

const LIST_COLUMNS =
  'slug,title,source,topic,category,time_limit_ms,memory_limit_kb,tests_count,difficulty,olymp_grade,olymp_level';
const DETAIL_COLUMNS = `${LIST_COLUMNS},statement,input_format,output_format,constraints,hint,examples`;

export const CATALOG_TTL_MS = 5 * 60 * 1000;

export interface ProblemCatalog {
  list(): Promise<{ fetchedAt: string; problems: ProblemSummary[] }>;
  detail(slug: string): Promise<ProblemDetail | null>;
}

interface SourceOptions {
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => number;
  readonly ttlMs?: number;
  readonly url?: string;
  readonly key?: string;
}

function catalogBase(): string {
  return (process.env.COLLABORARE_SUPABASE_URL ?? DEFAULT_CATALOG_URL).replace(/\/$/, '');
}

function catalogKey(): string {
  return process.env.COLLABORARE_SUPABASE_KEY ?? DEFAULT_CATALOG_KEY;
}

async function readRows(response: Response): Promise<CatalogRow[]> {
  if (!response.ok) {
    throw new Error(`catalog answered ${response.status}`);
  }
  const body: unknown = await response.json();
  if (!Array.isArray(body)) {
    throw new Error('catalog was not a list');
  }
  return body as CatalogRow[];
}

export function createProblemCatalog(options: SourceOptions = {}): ProblemCatalog {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? CATALOG_TTL_MS;
  const base = (options.url ?? catalogBase()).replace(/\/$/, '');
  const key = options.key ?? catalogKey();
  let listCache: {
    readonly at: number;
    readonly fetchedAt: string;
    readonly problems: ProblemSummary[];
  } | null = null;
  const details = new Map<
    string,
    { readonly at: number; readonly problem: ProblemDetail | null }
  >();

  const headers = {
    apikey: key,
    authorization: `Bearer ${key}`,
    accept: 'application/json',
  };

  const loadList = async (): Promise<{ fetchedAt: string; problems: ProblemSummary[] }> => {
    const cached = listCache;
    if (cached && now() - cached.at < ttlMs) {
      return { fetchedAt: cached.fetchedAt, problems: cached.problems };
    }
    const endpoint = new URL('/rest/v1/problems', base);
    endpoint.searchParams.set('select', LIST_COLUMNS);
    endpoint.searchParams.set('order', 'difficulty.asc,title.asc');
    endpoint.searchParams.set('limit', '2000');
    const rows = await readRows(await fetchImpl(endpoint, { headers }));
    const problems = rows.flatMap((row) => {
      const summary = summaryFromRow(row);
      return summary ? [summary] : [];
    });
    const fetchedAt = new Date(now()).toISOString();
    listCache = { at: now(), fetchedAt, problems };
    return { fetchedAt, problems };
  };

  return {
    list: loadList,
    async detail(slug) {
      if (!isProblemSlug(slug)) {
        return null;
      }
      const cached = details.get(slug);
      if (cached && now() - cached.at < ttlMs) {
        return cached.problem;
      }
      const endpoint = new URL('/rest/v1/problems', base);
      endpoint.searchParams.set('select', DETAIL_COLUMNS);
      endpoint.searchParams.set('slug', `eq.${slug}`);
      endpoint.searchParams.set('limit', '1');
      const rows = await readRows(await fetchImpl(endpoint, { headers }));
      const problem = rows[0] ? detailFromRow(rows[0]) : null;
      details.set(slug, { at: now(), problem });
      return problem;
    },
  };
}
