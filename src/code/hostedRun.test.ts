import { describe, expect, it, vi } from 'vitest';
import { REJECTION_MESSAGES, type ExecutionRequest } from './execution';
import { runOnHostedCompiler, serverHasNoSandbox } from './hostedRun';

const request: ExecutionRequest = {
  language: 'cpp',
  code: '#include <iostream>\nint main(){std::cout<<"hello world";}\n',
  stdin: '',
  files: [],
};

describe('serverHasNoSandbox', () => {
  it('recognises the deployment that has no runner', () => {
    expect(serverHasNoSandbox(REJECTION_MESSAGES.unavailable)).toBe(true);
    expect(serverHasNoSandbox('the cloud sandbox answered 503')).toBe(false);
    expect(serverHasNoSandbox(null)).toBe(false);
  });
});

describe('runOnHostedCompiler', () => {
  it('returns the program output when the signaling server will not run it', async () => {
    let compiler = '';
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      compiler = (JSON.parse(String(init?.body)) as { compiler: string }).compiler;
      return new Response(JSON.stringify({ status: '0', program_output: 'hello world' }), {
        status: 200,
      });
    });

    const outcome = await runOnHostedCompiler(request, fetchImpl);

    expect(outcome).toEqual({
      stdout: 'hello world',
      stderr: '',
      exitCode: 0,
      timedOut: false,
      error: null,
    });
    expect(compiler).toBe('gcc-head');
  });

  it('keeps a compiler failure on stderr instead of claiming the sandbox is off', async () => {
    const fetchImpl = vi.fn(async () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            status: '1',
            compiler_error: "main.cpp:7: error: 'cout' was not declared",
          }),
          { status: 200 },
        ),
      ),
    );

    const outcome = await runOnHostedCompiler(request, fetchImpl);

    expect(outcome.error).toBeNull();
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr).toContain('cout');
  });

  it('reports a compiler host that cannot be reached', async () => {
    const fetchImpl = vi.fn(async () => Promise.reject(new Error('ENOTFOUND')));

    const outcome = await runOnHostedCompiler(request, fetchImpl);

    expect(outcome.error).toMatch(/could not be reached/);
    expect(outcome.stdout).toBe('');
  });
});
