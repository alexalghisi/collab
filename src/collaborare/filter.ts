import type { CatalogItem, CatalogQuery } from './types';

export function catalogCategories(items: readonly CatalogItem[]): string[] {
  const names = new Set<string>();
  for (const item of items) {
    if (item.category !== '') {
      names.add(item.category);
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b, 'ro'));
}

export function filterCatalog(items: readonly CatalogItem[], query: CatalogQuery): CatalogItem[] {
  const needle = query.text.trim().toLocaleLowerCase('ro');
  return items.filter((item) => {
    if (query.kind !== 'all' && item.kind !== query.kind) {
      return false;
    }
    if (query.category !== '' && query.category !== 'all' && item.category !== query.category) {
      return false;
    }
    if (needle === '') {
      return true;
    }
    const haystack =
      `${item.title} ${item.category} ${item.topic} ${item.statement}`.toLocaleLowerCase('ro');
    return haystack.includes(needle);
  });
}
