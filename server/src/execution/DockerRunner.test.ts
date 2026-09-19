import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { ChildProcess } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import type { ExecutionChunk } from '../../../src/code/execution';
import { MAX_OUTPUT_BYTES } from '../../../src/code/execution';
import { CODE_LANGUAGES } from '../../../src/code/languages';
import { DEFAULT_LIMITS, DockerRunner, dockerCreateArgs, type Spawn } from './DockerRunner';
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

interface Docker {
  readonly spawn: Spawn;
  readonly calls: Invocation[];
  /** The attached run, which stays open until the test closes it. */
  readonly runs: FakeProcess[];
}

/** `fails` makes one docker subcommand behave like a daemon that is not there. */
function fakeDocker(fails?: { command: string; stderr?: string; error?: Error }): Docker {
  const calls: Invocation[] = [];
  const runs: FakeProcess[] = [];
  const spawn: Spawn = (command, args) => {
    calls.push({ command, args });
    const child = new FakeProcess();
    if (fails?.command === args[0]) {
      setImmediate(() => {
        if (fails.error) {
          child.emit('error', fails.error);
          return;
        }
        child.stderr.write(fails.stderr ?? 'boom');
        child.emit('close', 1);
      });
    } else if (args[0] === 'start') {
      runs.push(child);
    } else {
      setImmediate(() => child.emit('close', 0));
    }
    return child as unknown as ChildProcess;
  };
  return { spawn, calls, runs };
}

const request = { language: 'python' as const, code: 'print(1)', stdin: '', files: [] };

/** run() writes a file and creates the container before the run itself starts. */
async function started(runs: FakeProcess[]): Promise<FakeProcess> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const child = runs.at(-1);
    if (child) {
      return child;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('the container was never started');
}

describe('dockerCreateArgs', () => {
  const pairsOf = (args: string[]) =>
    args.map((arg, index) => `${arg} ${args[index + 1] ?? ''}`.trim());

  it('isolates the container from the network and the host', () => {
    const args = dockerCreateArgs('python', 'run-1', DEFAULT_LIMITS);

    expect(args).toContain('--read-only');
    expect(pairsOf(args)).toContain('--network none');
    expect(pairsOf(args)).toContain('--cap-drop ALL');
    expect(pairsOf(args)).toContain('--security-opt no-new-privileges');
    expect(pairsOf(args)).toContain('--user 65534:65534');
  });

  it('caps memory, swap, cpu and process count', () => {
    const args = dockerCreateArgs('go', 'run-1', {
      ...DEFAULT_LIMITS,
      memoryMb: 128,
      cpus: 0.25,
      pids: 32,
    });

    expect(pairsOf(args)).toContain('--memory 128m');
    expect(pairsOf(args)).toContain('--memory-swap 128m');
    expect(pairsOf(args)).toContain('--cpus 0.25');
    expect(pairsOf(args)).toContain('--pids-limit 32');
  });

  it('carries the submission in a volume rather than a bind mount', () => {
    const args = dockerCreateArgs('python', 'run-1', DEFAULT_LIMITS);

    // A bind mount needs the daemon to share a host path; not every host does,
    // and it fails by arriving empty rather than by refusing.
    expect(args[args.indexOf('--volume') + 1]).toBe('/sandbox');
    expect(args.some((arg) => arg.includes(':/sandbox'))).toBe(false);
  });

  it('names the container so a timeout can kill it by name', () => {
    const args = dockerCreateArgs('javascript', 'run-42', DEFAULT_LIMITS);

    expect(args[args.indexOf('--name') + 1]).toBe('run-42');
  });

  it('names the copied file as the program to run, never a shell', () => {
    for (const language of CODE_LANGUAGES) {
      const args = dockerCreateArgs(language, 'run-1', DEFAULT_LIMITS);

      expect(args.some((arg) => arg.startsWith('/sandbox/main.'))).toBe(true);
      expect(args).not.toContain('sh');
      expect(args).not.toContain('-c');
    }
  });

  it('compiles C++ through the sandbox wrapper rather than a shell', () => {
    const args = dockerCreateArgs('cpp', 'run-1', DEFAULT_LIMITS);

    expect(args).toContain('collab-sandbox-cpp');
    expect(args.at(-2)).toBe('/usr/local/bin/run-cpp');
    expect(args.at(-1)).toBe('/sandbox/main.cpp');
  });
});

describe('DockerRunner', () => {
  it('creates, copies the submission in, runs it and cleans up', async () => {
    const docker = fakeDocker();
    const runner = new DockerRunner(DEFAULT_LIMITS, docker.spawn);

    const running = runner.run(request, () => {});
    (await started(docker.runs)).emit('close', 0);
    await running;

    expect(docker.calls.map((call) => call.args[0])).toEqual(['create', 'cp', 'start', 'cp', 'rm']);
    const container = docker.calls[0].args[docker.calls[0].args.indexOf('--name') + 1];
    expect(docker.calls[1].args[2]).toBe(`${container}:/sandbox/main.py`);
    expect(docker.calls[3].args[1]).toBe(`${container}:/tmp`);
    expect(docker.calls[4].args).toEqual(['rm', '--force', '--volumes', container]);
  });

  it('copies extra files into the working directory so the program can open them', async () => {
    const docker = fakeDocker();
    const runner = new DockerRunner(DEFAULT_LIMITS, docker.spawn);
    const files = [{ name: 'date.in', content: '3\n1 2 3\n' }];

    const running = runner.run({ ...request, language: 'cpp', files }, () => {});
    (await started(docker.runs)).emit('close', 0);
    await running;

    const container = docker.calls[0].args[docker.calls[0].args.indexOf('--name') + 1];
    expect(docker.calls.map((call) => call.args[0])).toEqual([
      'create',
      'cp',
      'cp',
      'start',
      'cp',
      'rm',
    ]);
    expect(docker.calls[1].args[2]).toBe(`${container}:/sandbox/main.cpp`);
    expect(docker.calls[2].args[2]).toBe(`${container}:/tmp/date.in`);
  });

  it('streams stdout and stderr as they arrive and reports the exit code', async () => {
    const docker = fakeDocker();
    const chunks: ExecutionChunk[] = [];
    const runner = new DockerRunner(DEFAULT_LIMITS, docker.spawn);

    const running = runner.run(request, (chunk) => chunks.push(chunk));
    const child = await started(docker.runs);
    child.stdout.write('1\n');
    child.stderr.write('a warning\n');
    child.emit('close', 3);

    expect(await running).toEqual({ exitCode: 3, timedOut: false, files: [] });
    expect(chunks).toEqual([
      { stream: 'stdout', text: '1\n' },
      { stream: 'stderr', text: 'a warning\n' },
    ]);
  });

  it('feeds the submitted input to the program', async () => {
    const docker = fakeDocker();
    const runner = new DockerRunner(DEFAULT_LIMITS, docker.spawn);

    const running = runner.run({ ...request, stdin: '7\n' }, () => {});
    const child = await started(docker.runs);
    const received = child.stdin.read() as Buffer | null;
    child.emit('close', 0);
    await running;

    expect(received?.toString()).toBe('7\n');
  });

  it('kills the container by name and reports a timeout', async () => {
    const docker = fakeDocker();
    const runner = new DockerRunner({ ...DEFAULT_LIMITS, timeoutMs: 20 }, docker.spawn);

    const running = runner.run({ ...request, code: 'while True: pass' }, () => {});
    const child = await started(docker.runs);
    // A killed container closes its stream; the runner reports the timeout.
    setTimeout(() => child.emit('close', null), 60);

    expect(await running).toEqual({ exitCode: null, timedOut: true, files: [] });
    const container = docker.calls[0].args[docker.calls[0].args.indexOf('--name') + 1];
    expect(docker.calls.filter((call) => call.args[0] === 'kill')).toEqual([
      { command: 'docker', args: ['kill', container] },
    ]);
  });

  it('truncates a flood of output instead of relaying all of it', async () => {
    const docker = fakeDocker();
    const chunks: ExecutionChunk[] = [];
    const runner = new DockerRunner(DEFAULT_LIMITS, docker.spawn);

    const running = runner.run(request, (chunk) => chunks.push(chunk));
    const child = await started(docker.runs);
    for (let written = 0; written <= MAX_OUTPUT_BYTES; written += 8192) {
      child.stdout.write('x'.repeat(8192));
    }
    child.emit('close', 0);
    await running;

    const relayed = chunks.reduce((total, chunk) => total + chunk.text.length, 0);
    expect(relayed).toBeLessThanOrEqual(MAX_OUTPUT_BYTES + '\n[output truncated]\n'.length);
    expect(chunks.at(-1)?.text).toContain('output truncated');
    expect(docker.calls.some((call) => call.args[0] === 'kill')).toBe(true);
  });

  it('reports a missing docker as an unavailable sandbox', async () => {
    const docker = fakeDocker({ command: 'create', error: new Error('spawn docker ENOENT') });
    const runner = new DockerRunner(DEFAULT_LIMITS, docker.spawn);

    await expect(runner.run(request, () => {})).rejects.toBeInstanceOf(SandboxUnavailableError);
  });

  it('reports why the daemon refused, and still cleans up', async () => {
    const docker = fakeDocker({ command: 'create', stderr: 'no such image: python:3.12-alpine' });
    const runner = new DockerRunner(DEFAULT_LIMITS, docker.spawn);

    await expect(runner.run(request, () => {})).rejects.toThrow(/no such image/);
    expect(docker.calls.at(-1)?.args[0]).toBe('rm');
  });

  it('does not start a container it could not copy the submission into', async () => {
    const docker = fakeDocker({ command: 'cp', stderr: 'container rootfs is marked read-only' });
    const runner = new DockerRunner(DEFAULT_LIMITS, docker.spawn);

    await expect(runner.run(request, () => {})).rejects.toThrow(/read-only/);
    expect(docker.calls.map((call) => call.args[0])).toEqual(['create', 'cp', 'rm']);
  });
});
