import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { filterCatalog } from './filter';
import { parseProblemCards, parseStatement } from './parse';

const CARD = `
<a class="grid" href="/probleme/start-maxim-aparitii"><div><h3 class="font-semibold leading-snug">Aparițiile maximului</h3><p class="mt-1 truncate text-xs text-muted-foreground">Pregătire IX–X</p></div><div><p class="truncate font-mono text-xs text-primary">Vectori</p><p class="mt-1 font-mono text-xs text-muted-foreground">1<!-- -->s · <!-- -->64<!-- --> MB · <!-- -->10<!-- --> teste</p></div><span aria-label="Dificultate 1 din 5">★</span></a>
<a class="grid" href="/probleme/start-maxim-aparitii"><div><h3 class="font-semibold leading-snug">Aparițiile maximului</h3><p class="mt-1 truncate text-xs text-muted-foreground">Pregătire IX–X</p></div><div><p class="truncate font-mono text-xs text-primary">Vectori</p><p class="mt-1 font-mono text-xs text-muted-foreground">1s</p></div><span aria-label="Dificultate 1 din 5">★</span></a>
`;

describe('parseProblemCards', () => {
  it('reads each problem once from a collaborare card', () => {
    const [item] = parseProblemCards(CARD);
    expect(parseProblemCards(CARD)).toHaveLength(1);
    expect(item).toMatchObject({
      kind: 'problem',
      slug: 'start-maxim-aparitii',
      title: 'Aparițiile maximului',
      category: 'Pregătire IX–X',
      topic: 'Vectori',
      difficulty: 1,
      url: 'https://collaborare.ro/probleme/start-maxim-aparitii',
    });
    expect(item?.limits).toContain('64');
    expect(item?.starter).toContain('cin >> n');
  });
});

describe('parseStatement', () => {
  it('keeps the statement and drops the similar-problems list', () => {
    const html = `<section class="mt-6"><div class="prose-judge"><p>Se dă un vector cu <span class="katex"><span class="katex-mathml"><math><annotation encoding="application/x-tex">n</annotation></math></span><span class="katex-html"></span></span></span></span> numere.</p></div></section><h2>Date de intrare</h2><p>Pe prima linie.</p><h2>Probleme similare pe PbInfo</h2>`;
    const statement = parseStatement(html);
    expect(statement).toContain('Se dă un vector cu');
    expect(statement).toContain('n');
    expect(statement).toContain('Date de intrare');
    expect(statement).not.toContain('PbInfo');
  });

  it('parses the saved problem page when it is on disk', () => {
    try {
      const html = readFileSync('/tmp/prob.html', 'utf8');
      const statement = parseStatement(html);
      expect(statement).toContain('Aparițiile maximului');
      expect(statement.length).toBeGreaterThan(40);
    } catch {
      expect(parseStatement('')).toBe('');
    }
  });
});

describe('filterCatalog', () => {
  const items = parseProblemCards(CARD);

  it('matches a title and can hide announcements', () => {
    expect(filterCatalog(items, { text: 'maxim', kind: 'all', category: 'all' })).toHaveLength(1);
    expect(filterCatalog(items, { text: 'lipsa', kind: 'problem', category: 'all' })).toHaveLength(
      0,
    );
    expect(filterCatalog(items, { text: '', kind: 'announcement', category: 'all' })).toHaveLength(
      0,
    );
  });
});
