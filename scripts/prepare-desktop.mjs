import { cp, rm } from 'node:fs/promises';
import path from 'node:path';

const scriptDir = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(scriptDir, '..');
const source = path.join(root, 'dist-web');
const target = path.join(root, 'desktop', 'web');

await rm(target, { recursive: true, force: true });
await cp(source, target, { recursive: true });

console.info(`Copied ${source} -> ${target}`);
