import { describe, expect, it } from 'vitest';
import { CLOUD_EXECUTE_URL, executeInCloud } from './cloudExecute';

const request = {
  language: 'cpp' as const,
  code: 'int main(){return 0;}',
  stdin: '',
  files: [{ name: 'date.in', content: '3\n' }],
};

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

    const run = await executeInCloud(request, fetchImpl);

    expect(stub.lastUrl).toBe(CLOUD_EXECUTE_URL);
    expect(stub.lastBody.compiler).toBe('gcc-head');
    expect(stub.lastBody.code).toBe(request.code);
    expect(stub.lastBody.codes).toEqual([{ file: 'date.in', code: '3\n' }]);
    expect(run.result).toEqual({ exitCode: 0, timedOut: false, files: [] });
    expect(run.stdout).toBe('42\n');
  });

  it('reads program_message when program_output is missing', async () => {
    const fetchImpl = stub({ status: '0', program_message: 'hello\n' });

    const run = await executeInCloud(request, fetchImpl);

    expect(run.stdout).toBe('hello\n');
  });

  it('surfaces compiler diagnostics on stderr', async () => {
    const fetchImpl = stub({
      status: '1',
      compiler_error: 'main.cpp:1: error: boom',
      program_output: '',
    });

    const run = await executeInCloud({ ...request, language: 'python' }, fetchImpl);

    expect(stub.lastBody.compiler).toBe('cpython-3.12.7');
    expect(run.result.exitCode).toBe(1);
    expect(run.stderr).toContain('boom');
  });

  it('treats a killed process as a timeout', async () => {
    const fetchImpl = stub({ status: '', signal: 'SIGKILL', program_output: '' });

    const run = await executeInCloud(request, fetchImpl);

    expect(run.result.timedOut).toBe(true);
    expect(run.result.exitCode).toBeNull();
  });

  it('rejects an unreachable host', async () => {
    const fetchImpl = (async () => {
      throw new Error('ENOTFOUND');
    }) as typeof fetch;

    await expect(executeInCloud(request, fetchImpl)).rejects.toThrow(/could not be reached/);
  });

  it('rejects a refused compile', async () => {
    const fetchImpl = stub({ message: 'nope' }, 503);

    await expect(executeInCloud(request, fetchImpl)).rejects.toThrow(/answered 503/);
  });
});
