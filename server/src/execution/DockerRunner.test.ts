import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { ChildProcess } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import type { ExecutionChunk } from '../../../src/code/execution';
import { MAX_OUTPUT_BYTES } from '../../../src/code/execution';
import { CODE_LANGUAGES } from '../../../src/code/languages';
import { DEFAULT_LIMITS, DockerRunner, dockerArgs, type Spawn } from './DockerRunner';
import { SandboxUnavailableError } from './SandboxRunner';

class FakeProcess extends EventEmitter {
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly stdin = new PassThrough();
  killed: NodeJS.Signals | null = null;

  kill(signal: NodeJS.Signals): boolean {
    this.killed = signal;
    return true;
  }

  unref(): void {}
}

interface Invocation {
  readonly command: string;
  readonly args: string[];
}

function fakeSpawn(): { spawn: Spawn; calls: Invocation[]; runs: FakeProcess[] } {
  const calls: Invocation[] = [];
  const runs: FakeProcess[] = [];
  const spawn: Spawn = (command, args) => {
    calls.push({ command, args });
    const process = new FakeProcess();
    if (args[0] === 'run') {
      runs.push(process);
    } else {
      setImmediate(() => process.emit('close', 0));
    }
    return process as unknown as ChildProcess;
  };
  return { spawn, calls, runs };
}

const request = { language: 'python', code: 'print(1)', stdin: '' } as const;

/** run() writes the submission to a temporary file before it spawns anything. */
async function spawned(runs: FakeProcess[]): Promise<FakeProcess> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const process = runs.at(-1);
    if (process) {
      return process;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('docker was never spawned');
}

describe('dockerArgs', () => {
  it('isolates the container from the network and the host filesystem', () => {
    const args = dockerArgs('python', '/tmp/run', 'run-1', DEFAULT_LIMITS);
    const pairs = args.map((arg, index) => `${arg} ${args[index + 1] ?? ''}`.trim());

    expect(args).toContain('--rm');
    expect(args).toContain('--read-only');
    expect(pairs).toContain('--network none');
    expect(pairs).toContain('--cap-drop ALL');
    expect(pairs).toContain('--security-opt no-new-privileges');
    expect(pairs).toContain('--user 65534:65534');
    expect(pairs).toContain('--volume /tmp/run:/sandbox:ro');
  });

  it('caps memory, swap, cpu and process count', () => {
    const args = dockerArgs('go', '/tmp/run', 'run-1', {
      ...DEFAULT_LIMITS,
      memoryMb: 128,
      cpus: 0.25,
      pids: 32,
    });
    const pairs = args.map((arg, index) => `${arg} ${args[index + 1] ?? ''}`.trim());

    expect(pairs).toContain('--memory 128m');
    expect(pairs).toContain('--memory-swap 128m');
    expect(pairs).toContain('--cpus 0.25');
    expect(pairs).toContain('--pids-limit 32');
  });

  it('names the container so a timeout can kill it by name', () => {
    const args = dockerArgs('javascript', '/tmp/run', 'run-42', DEFAULT_LIMITS);

    expect(args[args.indexOf('--name') + 1]).toBe('run-42');
  });

  it('runs the mounted file rather than passing code as an argument', () => {
    for (const language of CODE_LANGUAGES) {
      const args = dockerArgs(language, '/tmp/run', 'run-1', DEFAULT_LIMITS);

      expect(args.some((arg) => arg.startsWith('/sandbox/main.'))).toBe(true);
      expect(args).not.toContain('sh');
      expect(args).not.toContain('-c');
    }
  });
});

describe('DockerRunner', () => {
  it('streams stdout and stderr as they arrive and reports the exit code', async () => {
    const { spawn, runs } = fakeSpawn();
    const chunks: ExecutionChunk[] = [];
    const runner = new DockerRunner(DEFAULT_LIMITS, spawn);

    const running = runner.run(request, (chunk) => chunks.push(chunk));
    const process = await spawned(runs);
    process.stdout.write('1\n');
    process.stderr.write('a warning\n');
    process.emit('close', 3);

    expect(await running).toEqual({ exitCode: 3, timedOut: false });
    expect(chunks).toEqual([
      { stream: 'stdout', text: '1\n' },
      { stream: 'stderr', text: 'a warning\n' },
    ]);
  });

  it('feeds the submitted input to the program', async () => {
    const { spawn, runs } = fakeSpawn();
    const runner = new DockerRunner(DEFAULT_LIMITS, spawn);

    const running = runner.run({ ...request, stdin: '7\n' }, () => {});
    const process = await spawned(runs);
    const received = process.stdin.read() as Buffer | null;
    process.emit('close', 0);
    await running;

    expect(received?.toString()).toBe('7\n');
  });

  it('kills the container by name and reports a timeout', async () => {
    const { spawn, calls, runs } = fakeSpawn();
    const runner = new DockerRunner({ ...DEFAULT_LIMITS, timeoutMs: 20 }, spawn);

    const running = runner.run({ ...request, code: 'while True: pass' }, () => {});
    const process = await spawned(runs);
    // A killed container closes its stream; the runner reports the timeout.
    setTimeout(() => process.emit('close', null), 60);

    expect(await running).toEqual({ exitCode: null, timedOut: true });
    expect(process.killed).toBe('SIGKILL');
    const name = calls[0].args[calls[0].args.indexOf('--name') + 1];
    expect(calls.slice(1)).toEqual([{ command: 'docker', args: ['kill', name] }]);
  });

  it('truncates a flood of output instead of relaying all of it', async () => {
    const { spawn, runs } = fakeSpawn();
    const chunks: ExecutionChunk[] = [];
    const runner = new DockerRunner(DEFAULT_LIMITS, spawn);

    const running = runner.run(request, (chunk) => chunks.push(chunk));
    const process = await spawned(runs);
    for (let written = 0; written <= MAX_OUTPUT_BYTES; written += 8192) {
      process.stdout.write('x'.repeat(8192));
    }
    process.emit('close', 0);
    await running;

    const relayed = chunks.reduce((total, chunk) => total + chunk.text.length, 0);
    expect(relayed).toBeLessThanOrEqual(MAX_OUTPUT_BYTES + '\n[output truncated]\n'.length);
    expect(chunks.at(-1)?.text).toContain('output truncated');
    expect(process.killed).toBe('SIGKILL');
  });

  it('surfaces a missing docker as an unavailable sandbox', async () => {
    const { spawn, runs } = fakeSpawn();
    const runner = new DockerRunner(DEFAULT_LIMITS, spawn);

    const running = runner.run(request, () => {});
    (await spawned(runs)).emit('error', new Error('spawn docker ENOENT'));

    await expect(running).rejects.toBeInstanceOf(SandboxUnavailableError);
  });
});
