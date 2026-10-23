import { describe, expect, it } from 'vitest';
import catalog from './catalog.json';
import type { CatalogItem } from './types';

const items = catalog.items as CatalogItem[];

describe('collaborare catalog', () => {
  it('includes problems and announcements from collaborare.ro', () => {
    const problems = items.filter((item) => item.kind === 'problem');
    const announcements = items.filter((item) => item.kind === 'announcement');
    expect(problems.length).toBeGreaterThan(500);
    expect(announcements.map((item) => item.slug)).toEqual(
      expect.arrayContaining(['sesiuni-live', 'subiecte-oficiale']),
    );
    expect(
      problems.every((item) => item.statement.length > 0 && item.starter.includes('cin')),
    ).toBe(true);
  });
});
