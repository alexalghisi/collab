import { spawn as nodeSpawn, type ChildProcess } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  MAX_OUTPUT_BYTES,
  type ExecutionChunk,
  type ExecutionRequest,
  type ExecutionResult,
} from '../../../src/code/execution';
import type { CodeLanguage } from '../../../src/code/languages';
import {
  isWorkspaceFileName,
  MAX_FILE_BYTES,
  normalizeWorkspaceFiles,
  type WorkspaceFile,
} from '../../../src/code/workspaceFiles';
import { SandboxUnavailableError, type SandboxRunner } from './SandboxRunner';

export interface LocalLimits {
  /** Wall clock for the program itself, so an infinite loop cannot run forever. */
  readonly timeoutMs: number;
  /** A longer clock for compiling, which is slower and not attacker-controlled. */
  readonly compileTimeoutMs: number;
}

export const DEFAULT_LOCAL_LIMITS: LocalLimits = {
  timeoutMs: 8_000,
  compileTimeoutMs: 30_000,
};

/**
 * Shared, persistent Go build cache. Without it every run gets a fresh HOME and
 * recompiles the standard library — about a minute each time; with it the first
 * run seeds the cache and the rest are near-instant.
 */
const GO_CACHE_ROOT = join(tmpdir(), 'collab-go-cache');

export type Spawn = (command: string, args: string[], options: SpawnOptions) => ChildProcess;

export interface SpawnOptions {
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  readonly stdio: ['pipe', 'pipe', 'pipe'];
}

interface Step {
  readonly command: string;
  readonly args: string[];
}

interface LanguageCommand {
  readonly file: string;
  readonly compile?: (workdir: string) => Step;
  readonly run: (workdir: string) => Step;
  /** Extra environment the compiler or program needs on top of the sandbox base. */
  readonly env?: (workdir: string) => Record<string, string>;
}

const nodeBin = (): string => process.execPath;

const COMMANDS: Record<CodeLanguage, LanguageCommand> = {
  javascript: {
    file: 'main.js',
    run: () => ({ command: nodeBin(), args: ['main.js'] }),
  },
  typescript: {
    file: 'main.ts',
    run: () => ({ command: nodeBin(), args: ['--experimental-strip-types', 'main.ts'] }),
  },
  python: {
    file: 'main.py',
    run: () => ({ command: 'python3', args: ['main.py'] }),
  },
  go: {
    file: 'main.go',
    // Build then run the binary, so the (slow, cached) compile gets the longer
    // clock while the program itself stays on the short one.
    compile: (workdir) => ({
      command: 'go',
      args: ['build', '-o', join(workdir, 'main'), 'main.go'],
    }),
    run: (workdir) => ({ command: join(workdir, 'main'), args: [] }),
    env: () => ({
      GOCACHE: join(GO_CACHE_ROOT, 'build'),
      GOPATH: join(GO_CACHE_ROOT, 'path'),
      GOFLAGS: '-mod=mod',
      GOTOOLCHAIN: 'local',
      CGO_ENABLED: '0',
    }),
  },
  cpp: {
    file: 'main.cpp',
    compile: (workdir) => ({
      command: 'g++',
      args: ['-std=c++17', '-O2', '-o', join(workdir, 'main'), join(workdir, 'main.cpp')],
    }),
    run: (workdir) => ({ command: join(workdir, 'main'), args: [] }),
  },
};

/**
 * Runs a submission with the host compilers. Isolation is a throwaway directory,
 * a stripped environment (so secrets on the process are not inherited) and a
 * wall clock. Use Docker when the host must not execute guest code as the
 * signaling user.
 */
export class LocalRunner implements SandboxRunner {
  readonly name = 'local';

  constructor(
    private readonly limits: LocalLimits = DEFAULT_LOCAL_LIMITS,
    private readonly spawn: Spawn = (command, args, options) => nodeSpawn(command, args, options),
  ) {}

  async run(
    request: ExecutionRequest,
    onChunk: (chunk: ExecutionChunk) => void,
  ): Promise<ExecutionResult> {
    const spec = COMMANDS[request.language];
    const dir = await mkdtemp(join(tmpdir(), 'collab-local-'));
    const extraEnv = spec.env?.(dir) ?? {};
    try {
      await this.ensureCaches(request.language);
      await writeFile(join(dir, spec.file), request.code, 'utf8');
      for (const file of request.files ?? []) {
        await writeFile(join(dir, file.name), file.content, 'utf8');
      }
      if (spec.compile) {
        const compiled = await this.exec(
          spec.compile(dir),
          dir,
          '',
          onChunk,
          this.limits.compileTimeoutMs,
          extraEnv,
        );
        if (compiled.timedOut || (compiled.exitCode ?? 1) !== 0) {
          return { ...compiled, files: [] };
        }
      }
      const result = await this.exec(
        spec.run(dir),
        dir,
        request.stdin,
        onChunk,
        this.limits.timeoutMs,
        extraEnv,
      );
      const files = await collectGeneratedFiles(dir, request.files ?? []);
      return { ...result, files };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  /** Creates the persistent Go cache once; a no-op for the other languages. */
  private async ensureCaches(language: CodeLanguage): Promise<void> {
    if (language !== 'go') {
      return;
    }
    await mkdir(join(GO_CACHE_ROOT, 'build'), { recursive: true });
    await mkdir(join(GO_CACHE_ROOT, 'path'), { recursive: true });
  }

  private exec(
    step: Step,
    cwd: string,
    stdin: string,
    onChunk: (chunk: ExecutionChunk) => void,
    timeoutMs: number,
    extraEnv: Record<string, string>,
  ): Promise<ExecutionResult> {
    return new Promise((resolve, reject) => {
      const child = this.spawn(step.command, step.args, {
        cwd,
        env: sandboxEnv(cwd, extraEnv),
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let timedOut = false;
      let written = 0;
      let settled = false;

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, timeoutMs);

      const forward = (stream: ExecutionChunk['stream']) => (data: Buffer) => {
        if (written >= MAX_OUTPUT_BYTES) {
          return;
        }
        const text = data.toString('utf8').slice(0, MAX_OUTPUT_BYTES - written);
        written += Buffer.byteLength(text, 'utf8');
        onChunk({ stream, text });
        if (written >= MAX_OUTPUT_BYTES) {
          onChunk({ stream: 'stderr', text: '\n[output truncated]\n' });
          child.kill('SIGKILL');
        }
      };

      child.stdout?.on('data', forward('stdout'));
      child.stderr?.on('data', forward('stderr'));
      child.stdin?.on('error', () => {});
      child.stdin?.end(stdin);

      child.on('error', (cause: Error) => {
        clearTimeout(timer);
        if (!settled) {
          settled = true;
          reject(
            new SandboxUnavailableError(`${step.command} could not be started: ${cause.message}`),
          );
        }
      });

      child.on('close', (exitCode) => {
        clearTimeout(timer);
        if (!settled) {
          settled = true;
          resolve({ exitCode: timedOut ? null : exitCode, timedOut });
        }
      });
    });
  }
}

function sandboxEnv(workdir: string, extra: Record<string, string>): NodeJS.ProcessEnv {
  // A deliberately small environment so the child does not inherit the server's
  // secrets — only what a compiler and a program need to find their tools.
  return {
    NODE_ENV: process.env.NODE_ENV ?? 'production',
    PATH: process.env.PATH ?? '/usr/bin:/bin',
    HOME: workdir,
    TMPDIR: workdir,
    LANG: 'C',
    ...extra,
  };
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

function decodeTextFile(bytes: Buffer): string | null {
  if (bytes.includes(0)) {
    return null;
  }
  try {
    return new TextDecoder('utf8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

async function collectGeneratedFiles(
  root: string,
  submitted: readonly WorkspaceFile[],
): Promise<WorkspaceFile[]> {
  const original = new Map(submitted.map((file) => [file.name, file.content]));
  let names: string[];
  try {
    names = await readdir(root);
  } catch {
    return [];
  }
  const found: WorkspaceFile[] = [];
  for (const name of names) {
    if (!isWorkspaceFileName(name)) {
      continue;
    }
    const path = join(root, name);
    if (await isDirectory(path)) {
      continue;
    }
    let bytes: Buffer;
    try {
      bytes = await readFile(path);
    } catch {
      continue;
    }
    if (bytes.byteLength > MAX_FILE_BYTES) {
      continue;
    }
    const content = decodeTextFile(bytes);
    if (content === null || content === original.get(name)) {
      continue;
    }
    found.push({ name, content });
  }
  return normalizeWorkspaceFiles(found);
}
