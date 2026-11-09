import { afterEach, describe, expect, it, vi } from 'vitest';
import { completeCloudUiRun } from './runInCloudUi';

const request = {
  language: 'cpp' as const,
  code: 'int main(){return 0;}',
  stdin: '',
  files: [],
};

const meta = { runId: 'run-1', byPeerId: 'peer-1', byDisplayName: 'Ada' };

afterEach(() => {
  vi.useRealTimers();
});

describe('completeCloudUiRun', () => {
  it('turns a successful compile into console output the room can show', async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ status: '0', program_output: '42\n' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch;

    await expect(completeCloudUiRun(request, meta, fetchImpl)).resolves.toEqual({
      ...meta,
      language: 'cpp',
      stdout: '42\n',
      stderr: '',
      exitCode: 0,
      timedOut: false,
      error: null,
      files: [{ name: 'date.out', content: '42\n' }],
    });
  });

  it('keeps a cloud failure as the run error instead of a disabled sandbox', async () => {
    const fetchImpl = (async () => {
      throw new Error('ENOTFOUND');
    }) as typeof fetch;

    // The compiler is asked again after a pause; the test does not sit through it.
    vi.useFakeTimers();
    const pending = completeCloudUiRun(request, meta, fetchImpl);
    await vi.runAllTimersAsync();
    const run = await pending;

    expect(run.error).toMatch(/could not be reached/);
    expect(run.exitCode).toBeNull();
  });
});
