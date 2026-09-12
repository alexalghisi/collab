import { cp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');
const source = path.join(root, 'dist-web');
const target = path.join(root, 'desktop', 'web');

await rm(target, { recursive: true, force: true });
await cp(source, target, { recursive: true });

console.info(`Copied ${source} -> ${target}`);
