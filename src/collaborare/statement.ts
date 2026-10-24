import { COLLABORARE_SITE, type ProblemImage } from './types';

export function absoluteCollaborareUrl(url: string): string {
  const trimmed = url.trim();
  if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
    return trimmed;
  }
  if (trimmed.startsWith('//')) {
    return `https:${trimmed}`;
  }
  if (trimmed.startsWith('/')) {
    return `${COLLABORARE_SITE}${trimmed}`;
  }
  return `${COLLABORARE_SITE}/${trimmed}`;
}

function pushImage(images: ProblemImage[], seen: Set<string>, alt: string, url: string): void {
  const absolute = absoluteCollaborareUrl(url);
  if (absolute === '' || seen.has(absolute)) {
    return;
  }
  seen.add(absolute);
  images.push({ alt: alt.trim(), url: absolute });
}

/** Images referenced by the statement markdown or HTML. */
export function imagesInStatement(statement: string): ProblemImage[] {
  const images: ProblemImage[] = [];
  const seen = new Set<string>();
  for (const match of statement.matchAll(/!\[([^\]]*)]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    pushImage(images, seen, match[1] ?? '', match[2] ?? '');
  }
  for (const match of statement.matchAll(/<img\b([^>]*?)>/gi)) {
    const tag = match[1] ?? '';
    const src = tag.match(/\bsrc=["']([^"']+)["']/i)?.[1];
    if (!src) {
      continue;
    }
    const alt = tag.match(/\balt=["']([^"']*)["']/i)?.[1] ?? '';
    pushImage(images, seen, alt, src);
  }
  return images;
}

/** Display and inline math, kept as the source wrote it. */
export function formulasInStatement(statement: string): string[] {
  const formulas: string[] = [];
  const seen = new Set<string>();
  const patterns = [/\$\$([\s\S]+?)\$\$/g, /\\\[([\s\S]+?)\\\]/g, /\\\(([\s\S]+?)\\\)/g];
  for (const pattern of patterns) {
    for (const match of statement.matchAll(pattern)) {
      const formula = (match[1] ?? '').trim();
      if (formula !== '' && !seen.has(formula)) {
        seen.add(formula);
        formulas.push(formula);
      }
    }
  }
  const withoutBlocks = statement
    .replace(/\$\$[\s\S]+?\$\$/g, ' ')
    .replace(/\\\[[\s\S]+?\\\]/g, ' ')
    .replace(/\\\([\s\S]+?\\\)/g, ' ');
  for (const match of withoutBlocks.matchAll(/(^|[^\\$])\$([^$\n]+?)\$/g)) {
    const formula = (match[2] ?? '').trim();
    if (formula !== '' && !seen.has(formula)) {
      seen.add(formula);
      formulas.push(formula);
    }
  }
  return formulas;
}
