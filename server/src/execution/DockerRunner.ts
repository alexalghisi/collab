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
  // Compiling and running has to fit inside this; Go needs a few seconds of it.
  timeoutMs: 10_000,
  memoryMb: 256,
  cpus: 0.5,
  pids: 96,
  tmpfsMb: 64,
};

interface LanguageImage {
  readonly image: string;
  readonly file: string;
  readonly command: string[];
  /**
   * Paths that need to be writable while the root filesystem is not. Mounted as
   * anonymous volumes, which Docker seeds from the image — that is how the Go
   * build cache survives into a run without the compiler recompiling the
   * standard library every time.
   */
  readonly writable?: string[];
}

/** Where the submission is copied to; a volume, so the root can stay read-only. */
const SANDBOX_DIR = '/sandbox';

const IMAGES: Record<CodeLanguage, LanguageImage> = {
  javascript: {
    image: 'node:22-alpine',
    file: 'main.js',
    command: ['node', `${SANDBOX_DIR}/main.js`],
  },
  typescript: {
    image: 'node:22-alpine',
    file: 'main.ts',
    command: ['node', '--experimental-strip-types', `${SANDBOX_DIR}/main.ts`],
  },
  python: {
    image: 'python:3.12-alpine',
    file: 'main.py',
    command: ['python3', `${SANDBOX_DIR}/main.py`],
  },
  go: {
    image: 'collab-sandbox-go',
    file: 'main.go',
    command: ['go', 'run', `${SANDBOX_DIR}/main.go`],
    writable: ['/gocache', '/gopath'],
  },
};

export type Spawn = (command: string, args: string[]) => ChildProcess;

/**
 * Builds the `docker create` arguments. Kept separate so the isolation flags are
 * asserted in tests: every one of them is load-bearing, and losing one silently
 * would hand untrusted code the host.
 */
export function dockerCreateArgs(
  language: CodeLanguage,
  containerName: string,
  limits: DockerLimits,
): string[] {
  const { image, command, writable = [] } = IMAGES[language];
  return [
    'create',
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
    // The submission is copied into a volume rather than bind-mounted from the
    // host: a bind mount needs the daemon to be allowed to share that path,
    // which is not true of every host and fails by arriving empty.
    '--volume',
    SANDBOX_DIR,
    ...writable.flatMap((path) => ['--volume', path]),
    '--tmpfs',
    `/tmp:rw,exec,size=${limits.tmpfsMb}m`,
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges',
    '--user',
    '65534:65534',
    '--workdir',
    '/tmp',
    '--env',
    'HOME=/tmp',
    '--env',
    'GOFLAGS=-mod=mod',
    image,
    ...command,
  ];
}

/**
 * Runs a submission in a throwaway container: no network, capped memory, CPU and
 * process count, a read-only root, and a wall clock it cannot outlive. The code
 * is copied in as a file and named as the program to run, so it never passes
 * through a shell.
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
    const { file } = IMAGES[request.language];
    const dir = await mkdtemp(join(tmpdir(), 'collab-run-'));
    const source = join(dir, file);
    const container = `collab-run-${randomUUID()}`;
    try {
      await writeFile(source, request.code, 'utf8');
      await this.docker(dockerCreateArgs(request.language, container, this.limits));
      await this.docker(['cp', source, `${container}:${SANDBOX_DIR}/${file}`]);
      return await this.start(container, request.stdin, onChunk);
    } finally {
      await rm(dir, { recursive: true, force: true });
      // -v also drops the volume the submission was copied into.
      this.spawn('docker', ['rm', '--force', '--volumes', container]).unref?.();
    }
  }

  /** Runs a short docker command, rejecting when the daemon is not usable. */
  private docker(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = this.spawn('docker', args);
      let stderr = '';
      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString('utf8');
      });
      child.on('error', (cause: Error) =>
        reject(new SandboxUnavailableError(`docker could not be started: ${cause.message}`)),
      );
      child.on('close', (exitCode) => {
        if (exitCode === 0) {
          resolve();
        } else {
          reject(new SandboxUnavailableError(`docker ${args[0]} failed: ${stderr.trim()}`));
        }
      });
    });
  }

  private start(
    container: string,
    stdin: string,
    onChunk: (chunk: ExecutionChunk) => void,
  ): Promise<ExecutionResult> {
    return new Promise((resolve, reject) => {
      const child = this.spawn('docker', ['start', '--attach', '--interactive', container]);
      let timedOut = false;
      let written = 0;
      let settled = false;

      const kill = (): void => {
        this.spawn('docker', ['kill', container]).unref?.();
      };

      const timer = setTimeout(() => {
        timedOut = true;
        kill();
      }, this.limits.timeoutMs);

      const forward = (stream: ExecutionChunk['stream']) => (data: Buffer) => {
        if (written >= MAX_OUTPUT_BYTES) {
          return;
        }
        const text = data.toString('utf8').slice(0, MAX_OUTPUT_BYTES - written);
        written += Buffer.byteLength(text, 'utf8');
        onChunk({ stream, text });
        if (written >= MAX_OUTPUT_BYTES) {
          onChunk({ stream: 'stderr', text: '\n[output truncated]\n' });
          kill();
        }
      };

      child.stdout?.on('data', forward('stdout'));
      child.stderr?.on('data', forward('stderr'));
      // A program is free to exit without reading its input.
      child.stdin?.on('error', () => {});
      child.stdin?.end(stdin);

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
