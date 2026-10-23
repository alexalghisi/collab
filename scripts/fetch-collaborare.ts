import { writeFileSync } from 'node:fs';
import { parseAnnouncement, parseProblemCards, parseStatement } from '../src/collaborare/parse';

const headers = { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' };

async function page(path: string): Promise<string> {
  const response = await fetch(`https://collaborare.ro${path}`, { headers });
  if (!response.ok) {
    throw new Error(`${path} ${response.status}`);
  }
  return response.text();
}

const home = await page('/');
const problems = parseProblemCards(home);
const queue = [...problems];

async function worker(): Promise<void> {
  for (;;) {
    const item = queue.shift();
    if (!item) {
      return;
    }
    const html = await page(`/probleme/${item.slug}`);
    const statement = parseStatement(html);
    const index = problems.findIndex((row) => row.slug === item.slug);
    if (index >= 0 && statement) {
      problems[index] = { ...problems[index], statement };
    }
  }
}

await Promise.all(Array.from({ length: 12 }, () => worker()));

const announcements = [
  parseAnnouncement(await page('/idee'), 'sesiuni-live', 'Sesiuni live', '/idee'),
  parseAnnouncement(
    await page('/subiecte-oficiale'),
    'subiecte-oficiale',
    'Subiecte oficiale',
    '/subiecte-oficiale',
  ),
];

writeFileSync(
  'src/collaborare/catalog.json',
  JSON.stringify({
    source: 'https://collaborare.ro',
    fetchedAt: new Date().toISOString(),
    items: [...announcements, ...problems],
  }),
);
console.info(`Wrote ${announcements.length + problems.length} collaborare items`);
