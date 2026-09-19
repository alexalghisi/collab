import { describe, expect, it } from 'vitest';
import { CloudRunner } from './CloudRunner';

describe('CloudRunner', () => {
  it('forwards stdout and stderr from the hosted compiler', async () => {
    const runner = new CloudRunner(
      async () =>
        new Response(
          JSON.stringify({
            status: '0',
            program_output: 'ok\n',
            program_error: 'warn\n',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    );
    const chunks: Array<{ stream: string; text: string }> = [];

    const result = await runner.run(
      { language: 'javascript', code: 'console.log(1)', stdin: '', files: [] },
      (chunk) => {
        chunks.push(chunk);
      },
    );

    expect(runner.name).toBe('cloud');
    expect(result).toEqual({ exitCode: 0, timedOut: false, files: [] });
    expect(chunks).toEqual([
      { stream: 'stdout', text: 'ok\n' },
      { stream: 'stderr', text: 'warn\n' },
    ]);
  });
});
