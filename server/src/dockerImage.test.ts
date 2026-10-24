import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..', '..');

/** Paths (relative to the repo root) that server/Dockerfile copies into the image. */
function copiedPaths(): string[] {
  const dockerfile = readFileSync(join(ROOT, 'server', 'Dockerfile'), 'utf8');
  return dockerfile
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('COPY '))
    .flatMap((line) =>
      line
        .replace(/^COPY\s+/, '')
        .split(/\s+/)
        .slice(0, -1),
    )
    .map((path) => path.replace(/^\.\//, '').replace(/\/$/, ''));
}

function resolveImport(from: string, spec: string): string | null {
  const base = resolve(dirname(from), spec);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) {
    if (
      existsSync(candidate) &&
      !candidate.endsWith('/') &&
      /\.(ts|tsx|js|json)$/.test(candidate)
    ) {
      return candidate;
    }
  }
  return null;
}

/** Every file the running server loads, following relative, non-type-only imports. */
function serverImportGraph(entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [entry];
  const importPattern =
    /^\s*(?:import|export)\s+(?!type\s)(?:[^'"]*?\sfrom\s+)?['"](\.{1,2}\/[^'"]+)['"]/gm;
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) {
      continue;
    }
    seen.add(file);
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(importPattern)) {
      const target = resolveImport(file, match[1]);
      if (target) {
        queue.push(target);
      }
    }
  }
  return seen;
}

describe('server Docker image', () => {
  it('contains every module the server imports at startup', () => {
    const copied = copiedPaths();
    const missing = [...serverImportGraph(join(ROOT, 'server', 'src', 'index.ts'))]
      .map((file) => relative(ROOT, file))
      .filter((file) => !copied.some((path) => file === path || file.startsWith(`${path}/`)));
    expect(missing).toEqual([]);
  });

  it('ships the ICE/TURN modules behind /ice', () => {
    const graph = [...serverImportGraph(join(ROOT, 'server', 'src', 'index.ts'))].map((file) =>
      relative(ROOT, file),
    );
    expect(graph).toContain('server/src/ice.ts');
    expect(graph).toContain('src/webrtc/config.ts');
  });
});
