/** Extra files that sit next to the program: `date.in`, `date.out`, and so on. */
export interface WorkspaceFile {
  readonly name: string;
  readonly content: string;
}

export const MAX_WORKSPACE_FILES = 20;
export const MAX_FILE_BYTES = 16_000;
export const MAX_WORKSPACE_BYTES = 64_000;

/**
 * Names the sandbox already uses for the submission and the compiled binary.
 * A workspace file must not steal those paths.
 */
const RESERVED_NAMES = new Set(['main', 'main.js', 'main.ts', 'main.py', 'main.go', 'main.cpp']);

const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$/;

const byteLength = (value: string): number => new TextEncoder().encode(value).length;

export function isWorkspaceFileName(name: string): boolean {
  return FILE_NAME.test(name) && !RESERVED_NAMES.has(name);
}

function clipToBytes(value: string, maxBytes: number): string {
  if (byteLength(value) <= maxBytes) {
    return value;
  }
  const encoded = new TextEncoder().encode(value).slice(0, maxBytes);
  return new TextDecoder().decode(encoded);
}

/** Drops reserved names, duplicates and anything over the size caps. */
export function normalizeWorkspaceFiles(input: unknown): WorkspaceFile[] {
  if (!Array.isArray(input)) {
    return [];
  }
  const seen = new Set<string>();
  const files: WorkspaceFile[] = [];
  let total = 0;
  for (const entry of input) {
    if (files.length >= MAX_WORKSPACE_FILES) {
      break;
    }
    const record = (entry ?? {}) as Partial<WorkspaceFile>;
    const name = typeof record.name === 'string' ? record.name : '';
    if (!isWorkspaceFileName(name) || seen.has(name)) {
      continue;
    }
    const raw = typeof record.content === 'string' ? record.content : '';
    const remaining = MAX_WORKSPACE_BYTES - total;
    if (remaining <= 0) {
      break;
    }
    const content = clipToBytes(raw, Math.min(MAX_FILE_BYTES, remaining));
    seen.add(name);
    files.push({ name, content });
    total += byteLength(content);
  }
  return files;
}

export function mergeWorkspaceFiles(
  current: readonly WorkspaceFile[],
  incoming: readonly WorkspaceFile[],
): WorkspaceFile[] {
  const byName = new Map<string, WorkspaceFile>();
  for (const file of current) {
    byName.set(file.name, file);
  }
  for (const file of incoming) {
    byName.set(file.name, file);
  }
  return normalizeWorkspaceFiles([...byName.values()]);
}

export function sameWorkspaceFiles(
  left: readonly WorkspaceFile[],
  right: readonly WorkspaceFile[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every(
    (file, index) => file.name === right[index]?.name && file.content === right[index]?.content,
  );
}
