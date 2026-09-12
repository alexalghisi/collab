import { spawn as nodeSpawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  MAX_OUTPUT_BYTES,
  type ExecutionChunk,
  type ExecutionRequest,
  type ExecutionResult,
} from '../../../src/code/execution';
import type { CodeLanguage } from '../../../src/code/languages';
import { SandboxUnavailableError, type SandboxRunner } from './SandboxRunner';

export interface DockerLimits {
  readonly timeoutMs: number;
  readonly memoryMb: number;
  readonly cpus: number;
  readonly pids: number;
  /** Writable scratch space, in megabytes; compilers need somewhere to work. */
  readonly tmpfsMb: number;
}

export const DEFAULT_LIMITS: DockerLimits = {
  timeoutMs: 8000,
  memoryMb: 256,
  cpus: 0.5,
  pids: 96,
  tmpfsMb: 64,
};

interface LanguageImage {
  readonly image: string;
  readonly file: string;
  readonly command: string[];
}

const IMAGES: Record<CodeLanguage, LanguageImage> = {
  javascript: {
    image: 'node:22-alpine',
    file: 'main.js',
    command: ['node', '/sandbox/main.js'],
  },
  typescript: {
    image: 'node:22-alpine',
    file: 'main.ts',
    command: ['node', '--experimental-strip-types', '/sandbox/main.ts'],
  },
  python: {
    image: 'python:3.12-alpine',
    file: 'main.py',
    command: ['python3', '/sandbox/main.py'],
  },
  go: {
    image: 'golang:1.23-alpine',
    file: 'main.go',
    command: ['go', 'run', '/sandbox/main.go'],
  },
};

export type Spawn = (command: string, args: string[]) => ChildProcess;

/**
 * Builds the `docker run` arguments. Kept separate so the isolation flags are
 * asserted in tests: every one of them is load-bearing, and losing one silently
 * would hand untrusted code the host.
 */
export function dockerArgs(
  language: CodeLanguage,
  mountDir: string,
  containerName: string,
  limits: DockerLimits,
): string[] {
  const { image, command } = IMAGES[language];
  return [
    'run',
    '--rm',
    '--interactive',
    '--name',
    containerName,
    '--network',
    'none',
    '--memory',
    `${limits.memoryMb}m`,
    // Without a swap cap equal to memory, the limit can be escaped through swap.
    '--memory-swap',
    `${limits.memoryMb}m`,
    '--cpus',
    String(limits.cpus),
    '--pids-limit',
    String(limits.pids),
    '--read-only',
    '--tmpfs',
    `/tmp:rw,exec,size=${limits.tmpfsMb}m`,
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges',
    '--user',
    '65534:65534',
    '--volume',
    `${mountDir}:/sandbox:ro`,
    '--workdir',
    '/tmp',
    '--env',
    'HOME=/tmp',
    '--env',
    'GOCACHE=/tmp/go-build',
    '--env',
    'GOPATH=/tmp/go',
    '--env',
    'GOFLAGS=-mod=mod',
    image,
    ...command,
  ];
}

/**
 * Runs a submission in a throwaway container: no network, capped memory, CPU and
 * process count, a read-only root with the code mounted read-only, and a wall
 * clock the container cannot outlive. The code is written to a file and mounted
 * rather than interpolated into a command, so there is no shell to escape.
 */
export class DockerRunner implements SandboxRunner {
  readonly name = 'docker';

  constructor(
    private readonly limits: DockerLimits = DEFAULT_LIMITS,
    private readonly spawn: Spawn = nodeSpawn,
  ) {}

  async run(
    request: ExecutionRequest,
    onChunk: (chunk: ExecutionChunk) => void,
  ): Promise<ExecutionResult> {
    const dir = await mkdtemp(join(tmpdir(), 'collab-run-'));
    const containerName = `collab-run-${randomUUID()}`;
    try {
      await writeFile(join(dir, IMAGES[request.language].file), request.code, 'utf8');
      return await this.execute(request, containerName, dir, onChunk);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  private execute(
    request: ExecutionRequest,
    containerName: string,
    dir: string,
    onChunk: (chunk: ExecutionChunk) => void,
  ): Promise<ExecutionResult> {
    return new Promise((resolve, reject) => {
      const child = this.spawn(
        'docker',
        dockerArgs(request.language, dir, containerName, this.limits),
      );
      let timedOut = false;
      let written = 0;
      let settled = false;

      const kill = (): void => {
        this.spawn('docker', ['kill', containerName]).unref?.();
        child.kill('SIGKILL');
      };

      const timer = setTimeout(() => {
        timedOut = true;
        kill();
      }, this.limits.timeoutMs);

      const forward = (stream: ExecutionChunk['stream']) => (data: Buffer) => {
        if (written >= MAX_OUTPUT_BYTES) {
          return;
        }
        const room = MAX_OUTPUT_BYTES - written;
        const text = data.toString('utf8').slice(0, room);
        written += Buffer.byteLength(text, 'utf8');
        onChunk({ stream, text });
        if (written >= MAX_OUTPUT_BYTES) {
          onChunk({ stream: 'stderr', text: '\n[output truncated]\n' });
          kill();
        }
      };

      child.stdout?.on('data', forward('stdout'));
      child.stderr?.on('data', forward('stderr'));
      child.stdin?.on('error', () => {
        // The program may exit without reading its input.
      });
      child.stdin?.end(request.stdin);

      child.on('error', (cause: Error) => {
        clearTimeout(timer);
        if (!settled) {
          settled = true;
          reject(new SandboxUnavailableError(`docker could not be started: ${cause.message}`));
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
