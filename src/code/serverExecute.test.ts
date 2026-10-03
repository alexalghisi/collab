import { describe, expect, it } from 'vitest';
import { executeOnServer, executeSharedProgram } from './serverExecute';

const request = {
  language: 'javascript' as const,
  code: 'console.log(1)',
  stdin: '',
  files: [],
};

describe('executeOnServer', () => {
  it('posts the shared program and reads stdout back', async () => {
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe('https://sandbox.example/execute');
      expect(init?.method).toBe('POST');
      expect(JSON.parse(String(init?.body))).toMatchObject({ code: 'console.log(1)' });
      return new Response(
        JSON.stringify({ stdout: '1\n', stderr: '', exitCode: 0, timedOut: false, files: [] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as typeof fetch;

    await expect(executeOnServer(request, fetchImpl, 'https://sandbox.example')).resolves.toEqual({
      stdout: '1\n',
      stderr: '',
      result: { exitCode: 0, timedOut: false, files: [] },
    });
  });

  it('keeps the service error instead of a status code', async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ error: 'There is nothing to run yet.' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch;

    await expect(executeOnServer(request, fetchImpl, 'https://sandbox.example')).rejects.toThrow(
      'There is nothing to run yet.',
    );
  });

  it('uses the public compiler when the signaling server cannot be reached', async () => {
    const fetchImpl = (async (url: string | URL | Request) => {
      if (String(url).includes('sandbox.example')) {
        throw new Error('ECONNREFUSED');
      }
      return new Response(JSON.stringify({ status: '0', program_output: 'from cloud\n' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    const run = await executeSharedProgram(request, fetchImpl, 'https://sandbox.example');
    expect(run.stdout).toBe('from cloud\n');
    expect(run.result.exitCode).toBe(0);
  });
});
