import { describe, expect, it } from 'vitest';
import { CLOUD_EXECUTE_URL, executeInCloud } from './cloudExecute';

const request = {
  language: 'cpp' as const,
  code: 'int main(){return 0;}',
  stdin: '',
  files: [{ name: 'date.in', content: '3\n' }],
};

const noWait = async (): Promise<void> => {};

/** Answers each call from the list in turn; the last entry repeats. */
function sequence(answers: readonly (() => Response)[]): typeof fetch & { compilers: string[] } {
  const compilers: string[] = [];
  const fetchImpl = (async (_url, init) => {
    compilers.push((JSON.parse(String(init?.body)) as { compiler: string }).compiler);
    const answer = answers[Math.min(compilers.length, answers.length) - 1];
    return (answer as () => Response)();
  }) as typeof fetch;
  return Object.assign(fetchImpl, { compilers });
}

const ok = (): Response => new Response(JSON.stringify({ status: '0', program_output: 'ok\n' }));
const busy = (status: number) => (): Response => new Response('busy', { status });

function stub(body: unknown, status = 200): typeof fetch {
  return (async (url, init) => {
    stub.lastUrl = String(url);
    stub.lastBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
}
stub.lastUrl = '';
stub.lastBody = {} as Record<string, unknown>;

describe('executeInCloud', () => {
  it('sends C++ to the hosted compiler with sidecar files', async () => {
    const fetchImpl = stub({ status: '0', program_output: '42\n' });

    const run = await executeInCloud(request, fetchImpl, noWait);

    expect(stub.lastUrl).toBe(CLOUD_EXECUTE_URL);
    expect(stub.lastBody.compiler).toBe('gcc-13.2.0');
    expect(stub.lastBody.code).toBe(request.code);
    expect(stub.lastBody.codes).toEqual([{ file: 'date.in', code: '3\n' }]);
    expect(run.result).toEqual({ exitCode: 0, timedOut: false, files: [] });
    expect(run.stdout).toBe('42\n');
    expect(run.compileError).toBeNull();
  });

  it('reads program_message when program_output is missing', async () => {
    const fetchImpl = stub({ status: '0', program_message: 'hello\n' });

    const run = await executeInCloud(request, fetchImpl, noWait);

    expect(run.stdout).toBe('hello\n');
  });

  it('surfaces compiler diagnostics on stderr', async () => {
    const fetchImpl = stub({
      status: '1',
      compiler_error: 'main.cpp:1: error: boom',
      program_output: '',
    });

    const run = await executeInCloud({ ...request, language: 'python' }, fetchImpl, noWait);

    expect(stub.lastBody.compiler).toBe('cpython-3.12.7');
    expect(run.result.exitCode).toBe(1);
    expect(run.stderr).toContain('boom');
    expect(run.compileError).toContain('boom');
  });

  it('does not call a build failed when the program ran and only warnings were printed', async () => {
    const warned = await executeInCloud(
      request,
      stub({ status: '1', compiler_error: 'prog.cc:3:1: warning: no return statement' }),
      noWait,
    );
    const crashed = await executeInCloud(
      request,
      stub({ status: '1', compiler_error: 'prog.cc:3: error: x', program_error: 'terminate' }),
      noWait,
    );

    expect(warned.compileError).toBeNull();
    expect(crashed.compileError).toBeNull();
  });

  it('treats a killed process as a timeout', async () => {
    const fetchImpl = stub({ status: '', signal: 'SIGKILL', program_output: '' });

    const run = await executeInCloud(request, fetchImpl, noWait);

    expect(run.result.timedOut).toBe(true);
    expect(run.result.exitCode).toBeNull();
  });

  it('treats a kill reported by description as a timeout too', async () => {
    const run = await executeInCloud(request, stub({ status: '', signal: 'Killed' }), noWait);

    expect(run.result.timedOut).toBe(true);
  });

  it('retries a compile that timed out, on the backup C++ compiler', async () => {
    const compilers: unknown[] = [];
    const fetchImpl = (async (_url, init) => {
      compilers.push((JSON.parse(String(init?.body)) as { compiler: unknown }).compiler);
      if (compilers.length === 1) {
        throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
      }
      return new Response(JSON.stringify({ status: '0', program_output: '42\n' }));
    }) as typeof fetch;

    const run = await executeInCloud(request, fetchImpl, noWait);

    expect(compilers).toEqual(['gcc-13.2.0', 'gcc-head']);
    expect(run.stdout).toBe('42\n');
  });

  it('retries a compiler outage with the same compiler when a language has only one', async () => {
    const compilers: unknown[] = [];
    const fetchImpl = (async (_url, init) => {
      compilers.push((JSON.parse(String(init?.body)) as { compiler: unknown }).compiler);
      return compilers.length === 1
        ? new Response('busy', { status: 502 })
        : new Response(JSON.stringify({ status: '0', program_output: 'ok\n' }));
    }) as typeof fetch;

    const run = await executeInCloud({ ...request, language: 'python' }, fetchImpl, noWait);

    expect(compilers).toEqual(['cpython-3.12.7', 'cpython-3.12.7']);
    expect(run.stdout).toBe('ok\n');
  });

  it('gives up after two tries and says plainly that it was too slow', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    }) as typeof fetch;

    await expect(executeInCloud(request, fetchImpl, noWait)).rejects.toThrow(
      'the cloud sandbox could not be reached: the compiler did not answer in time. Press Run again.',
    );
    expect(calls).toBe(2);
  });

  it('does not retry a request the compiler refused', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return new Response('bad', { status: 400 });
    }) as typeof fetch;

    await expect(executeInCloud(request, fetchImpl, noWait)).rejects.toThrow(/answered 400/);
    expect(calls).toBe(1);
  });

  it('rejects an unreachable host', async () => {
    const fetchImpl = (async () => {
      throw new Error('ENOTFOUND');
    }) as typeof fetch;

    await expect(executeInCloud(request, fetchImpl, noWait)).rejects.toThrow(
      /could not be reached/,
    );
  });

  it('rides out a busy compiler: two refusals, then the answer', async () => {
    const fetchImpl = sequence([busy(429), busy(503), ok]);
    const waits: number[] = [];

    const run = await executeInCloud(request, fetchImpl, async (ms) => {
      waits.push(ms);
    });

    expect(run.stdout).toBe('ok\n');
    expect(fetchImpl.compilers).toEqual(['gcc-13.2.0', 'gcc-13.2.0', 'gcc-head']);
    expect(waits).toEqual([400, 1_200]);
  });

  it('asks again when the answer is not the JSON it should be', async () => {
    const fetchImpl = sequence([() => new Response('<html>Bad gateway</html>'), ok]);

    const run = await executeInCloud(request, fetchImpl, noWait);

    expect(run.stdout).toBe('ok\n');
    expect(fetchImpl.compilers).toHaveLength(2);
  });

  it('says in plain words that the answer could not be read, never a parser error', async () => {
    const fetchImpl = sequence([() => new Response('')]);

    await expect(executeInCloud(request, fetchImpl, noWait)).rejects.toThrow(
      'the cloud sandbox could not be reached: its answer could not be read. Press Run again.',
    );
    expect(fetchImpl.compilers).toHaveLength(3);
  });

  it('gives up on a compiler that stays busy after three tries', async () => {
    const fetchImpl = sequence([busy(503)]);

    await expect(executeInCloud(request, fetchImpl, noWait)).rejects.toThrow(
      'the cloud sandbox is busy (it answered 503). Press Run again.',
    );
    expect(fetchImpl.compilers).toHaveLength(3);
  });

  it('stops after the second timeout even when a busy answer came first', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      if (calls === 1) {
        return new Response('busy', { status: 503 });
      }
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    }) as typeof fetch;

    await expect(executeInCloud(request, fetchImpl, noWait)).rejects.toThrow(/in time/);
    expect(calls).toBe(3);
  });
});
