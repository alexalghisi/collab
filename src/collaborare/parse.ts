import { COLLABORARE_CPP_STARTER } from './starter';
import type { CatalogItem } from './types';

const SITE = 'https://collaborare.ro';

function decode(value: string): string {
  return value
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function textOf(html: string): string {
  const cleaned = html.replace(
    /<span class="katex">[\s\S]*?<\/span>\s*<\/span>\s*<\/span>/g,
    (block) => {
      const annotation = block.match(/<annotation[^>]*>([^<]*)<\/annotation>/);
      return annotation ? ` ${decode(annotation[1])} ` : '';
    },
  );
  return decode(cleaned)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|h2|li|pre|div)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export function parseProblemCards(html: string): CatalogItem[] {
  const items: CatalogItem[] = [];
  const seen = new Set<string>();
  const pattern =
    /href="\/probleme\/([^"]+)"[\s\S]*?<h3[^>]*>([^<]*)<\/h3>\s*<p[^>]*>([^<]*)<\/p>[\s\S]*?<p[^>]*class="truncate font-mono[^"]*"[^>]*>([^<]*)<\/p>\s*<p[^>]*>([\s\S]*?)<\/p>[\s\S]*?aria-label="Dificultate (\d+)/g;
  for (const match of html.matchAll(pattern)) {
    const slug = match[1] ?? '';
    if (slug === '' || seen.has(slug)) {
      continue;
    }
    seen.add(slug);
    items.push({
      kind: 'problem',
      slug,
      title: decode(match[2] ?? '').trim(),
      category: decode(match[3] ?? '').trim(),
      topic: decode(match[4] ?? '').trim(),
      limits: decode(match[5] ?? '')
        .replace(/\s+/g, ' ')
        .trim(),
      difficulty: Number(match[6] ?? '0'),
      statement: '',
      starter: COLLABORARE_CPP_STARTER,
      url: `${SITE}/probleme/${slug}`,
    });
  }
  return items;
}

export function parseStatement(html: string): string {
  const start = html.indexOf('<section class="mt-6">');
  if (start < 0) {
    return '';
  }
  const rest = html.slice(start);
  const end = rest.search(/Probleme similare|id="editor"|<form/);
  return textOf(end < 0 ? rest : rest.slice(0, end));
}

export function parseAnnouncement(
  html: string,
  slug: string,
  title: string,
  path: string,
): CatalogItem {
  const main = html.slice(html.indexOf('<main'));
  const body = textOf(main).replace(title, '').trim();
  return {
    kind: 'announcement',
    slug,
    title,
    category: 'Anunț',
    topic: '',
    difficulty: 0,
    limits: '',
    statement: body,
    starter: '',
    url: `${SITE}${path}`,
  };
}
