import { detailFromRow, type CatalogRow } from './map';
import type { ProblemDetail } from './types';

/** Public catalog the collaborare.ro site itself reads. Not a service-role key. */
export const PUBLIC_CATALOG_URL = 'https://fiinesljtryrjttzacbn.supabase.co';
export const PUBLIC_CATALOG_KEY = 'sb_publishable_IvFBgLjRs62GyrZHn0aaLw_GQEdSOqU';

const DETAIL_COLUMNS =
  'slug,title,source,topic,category,time_limit_ms,memory_limit_kb,tests_count,difficulty,olymp_grade,olymp_level,statement,input_format,output_format,constraints,hint,examples';

/**
 * The statement colaborare.ro shows for this slug, or null when the catalog
 * has no such problem. A local copy must not replace this.
 */
export async function fetchPublicProblem(
  slug: string,
  fetchImpl: typeof fetch,
  catalogUrl = PUBLIC_CATALOG_URL,
): Promise<ProblemDetail | null> {
  const endpoint = new URL('/rest/v1/problems', catalogUrl);
  endpoint.searchParams.set('select', DETAIL_COLUMNS);
  endpoint.searchParams.set('slug', `eq.${slug}`);
  endpoint.searchParams.set('limit', '1');
  const response = await fetchImpl(endpoint, {
    headers: {
      apikey: PUBLIC_CATALOG_KEY,
      authorization: `Bearer ${PUBLIC_CATALOG_KEY}`,
      accept: 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error(`catalog answered ${response.status}`);
  }
  const body: unknown = await response.json();
  const row = Array.isArray(body) ? body[0] : null;
  if (!row || typeof row !== 'object') {
    return null;
  }
  return detailFromRow(row as CatalogRow);
}
