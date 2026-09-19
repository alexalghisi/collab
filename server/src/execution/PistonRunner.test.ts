import { describe, expect, it } from 'vitest';
import type { ExecutionChunk } from '../../../src/code/execution';
import { DEFAULT_PISTON_OPTIONS, PistonRunner } from './PistonRunner';
import { SandboxUnavailableError } from './SandboxRunner';

interface Sent {
  readonly language: string;
  readonly version: string;
  readonly files: Array<{ name: string; content: string }>;
  readonly stdin: string;
  readonly run_timeout: number;
}

function stub(response: unknown, status = 200) {
  const sent: Sent[] = [];
  const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)) as Sent);
    return new Response(JSON.stringify(response), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
  return { sent, runner: new PistonRunner(DEFAULT_PISTON_OPTIONS, fetchImpl) };
}

const request = { language: 'python', code: 'print(1)', stdin: '2\n', files: [] } as const;

describe('PistonRunner', () => {
  it('relays stdout, stderr and the exit code', async () => {
    const { runner } = stub({ run: { stdout: '1\n', stderr: 'warn\n', code: 0 } });
    const chunks: ExecutionChunk[] = [];

    const result = await runner.run(request, (chunk) => chunks.push(chunk));

    expect(result).toEqual({ exitCode: 0, timedOut: false, files: [] });
    expect(chunks).toEqual([
      { stream: 'stdout', text: '1\n' },
      { stream: 'stderr', text: 'warn\n' },
    ]);
  });

  it('sends the file, the input and the run limits', async () => {
    const { runner, sent } = stub({ run: { stdout: '', code: 0 } });

    await runner.run({ ...request, language: 'go', code: 'package main' }, () => {});

    expect(sent[0].language).toBe('go');
    expect(sent[0].files).toEqual([{ name: 'main.go', content: 'package main' }]);
    expect(sent[0].stdin).toBe('2\n');
    expect(sent[0].run_timeout).toBe(DEFAULT_PISTON_OPTIONS.timeoutMs);
  });

  it('asks Piston for C++ with a .cpp file', async () => {
    const { runner, sent } = stub({ run: { stdout: '', code: 0 } });

    await runner.run({ ...request, language: 'cpp', code: 'int main() {}' }, () => {});

    expect(sent[0].language).toBe('c++');
    expect(sent[0].files).toEqual([{ name: 'main.cpp', content: 'int main() {}' }]);
  });

  it('sends extra workspace files next to the program', async () => {
    const { runner, sent } = stub({ run: { stdout: '', code: 0 } });

    await runner.run(
      { ...request, language: 'cpp', files: [{ name: 'date.in', content: '1' }] },
      () => {},
    );

    expect(sent[0].files).toEqual([
      { name: 'main.cpp', content: 'print(1)' },
      { name: 'date.in', content: '1' },
    ]);
  });

  it('reports a compile failure without pretending the program ran', async () => {
    const { runner } = stub({
      compile: { stderr: 'main.go:2: undefined: foo', code: 2 },
      run: { stdout: '', code: 0 },
    });
    const chunks: ExecutionChunk[] = [];

    const result = await runner.run({ ...request, language: 'go' }, (chunk) => chunks.push(chunk));

    expect(result).toEqual({ exitCode: 2, timedOut: false, files: [] });
    expect(chunks).toEqual([{ stream: 'stderr', text: 'main.go:2: undefined: foo' }]);
  });

  it('treats a killed run as a timeout', async () => {
    const { runner } = stub({ run: { stdout: '', stderr: '', code: null, signal: 'SIGKILL' } });

    expect(await runner.run(request, () => {})).toEqual({
      exitCode: null,
      timedOut: true,
      files: [],
    });
  });

  it('does not mistake a self-inflicted kill with an exit code for a timeout', async () => {
    const { runner } = stub({ run: { stdout: '', code: 137, signal: 'SIGKILL' } });

    expect(await runner.run(request, () => {})).toEqual({
      exitCode: 137,
      timedOut: false,
      files: [],
    });
  });

  it('reports an error response as an unavailable sandbox', async () => {
    const { runner } = stub({ message: 'runtime is unknown' }, 400);

    await expect(runner.run(request, () => {})).rejects.toBeInstanceOf(SandboxUnavailableError);
  });

  it('reports an unreachable sandbox rather than hanging', async () => {
    const failing = (() => Promise.reject(new Error('ENOTFOUND'))) as unknown as typeof fetch;
    const runner = new PistonRunner(DEFAULT_PISTON_OPTIONS, failing);

    await expect(runner.run(request, () => {})).rejects.toThrow(/could not be reached/);
  });

  it('reports a response with no result at all', async () => {
    const { runner } = stub({ message: 'nothing to report' });

    await expect(runner.run(request, () => {})).rejects.toBeInstanceOf(SandboxUnavailableError);
  });
});
