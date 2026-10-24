// Starts what the two-browser e2e needs, all on localhost:
//   - a stand-in for the collaborare.ro public catalog (fixture rows, PostgREST-shaped)
//   - the real signaling server (server/src/index.ts) pointed at that stand-in
//   - a static server for the exported web app (dist-web)
// Usage: node e2e/stack.mjs   (Ctrl+C stops everything)
import { spawn } from 'node:child_process';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve } from 'node:path';
import { setTimeout, clearTimeout } from 'node:timers';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
export const CATALOG_PORT = Number(process.env.E2E_CATALOG_PORT ?? 4555);
export const SIGNALING_PORT = Number(process.env.E2E_SIGNALING_PORT ?? 4000);
export const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 8081);

const rows = JSON.parse(readFileSync(join(root, 'e2e/fixtures/catalog.json'), 'utf8'));

function pick(row, select) {
  if (!select) return row;
  const out = {};
  for (const column of select.split(',')) out[column] = row[column];
  return out;
}

const catalog = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${CATALOG_PORT}`);
  if (url.pathname !== '/rest/v1/problems') {
    res.writeHead(404).end();
    return;
  }
  const slug = url.searchParams.get('slug');
  const wanted = slug?.startsWith('eq.') ? slug.slice(3) : null;
  const body = rows
    .filter((row) => wanted === null || row.slug === wanted)
    .map((row) => pick(row, url.searchParams.get('select')));
  res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(body));
});

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
};
const webRoot = join(root, 'dist-web');
const web = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
  let file = join(webRoot, path);
  if (!file.startsWith(webRoot) || !existsSync(file) || statSync(file).isDirectory()) {
    file = join(webRoot, 'index.html');
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});

export async function startStack() {
  if (!existsSync(join(webRoot, 'index.html'))) {
    throw new Error('dist-web is missing. Run: npm run e2e:build');
  }
  await new Promise((done) => catalog.listen(CATALOG_PORT, done));
  await new Promise((done) => web.listen(WEB_PORT, done));
  const server = spawn('npx', ['tsx', 'server/src/index.ts'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(SIGNALING_PORT),
      AUTH_SECRET: 'e2e-secret',
      COLLABORARE_SUPABASE_URL: `http://localhost:${CATALOG_PORT}`,
      COLLABORARE_SUPABASE_KEY: 'e2e',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stderr.on('data', (chunk) => process.stderr.write(chunk));
  await new Promise((done, fail) => {
    const timer = setTimeout(() => fail(new Error('signaling server did not start')), 60_000);
    server.stdout.on('data', (chunk) => {
      if (String(chunk).includes('listening on port')) {
        clearTimeout(timer);
        done();
      }
    });
    server.on('exit', (code) => fail(new Error(`signaling server exited ${code}`)));
  });
  return {
    async stop() {
      server.kill('SIGTERM');
      await new Promise((done) => catalog.close(done));
      await new Promise((done) => web.close(done));
    },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const stack = await startStack();
  console.info(`web http://localhost:${WEB_PORT}  signaling http://localhost:${SIGNALING_PORT}`);
  process.on('SIGINT', () => void stack.stop().then(() => process.exit(0)));
}
