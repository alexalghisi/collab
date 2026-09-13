import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type {
  ExecutionChunk,
  ExecutionRequest,
  ExecutionResult,
} from '../../../src/code/execution';
import { ExecutionService } from './ExecutionService';
import { RateLimiter } from './RateLimiter';
import { executionRouter } from './router';
import { SandboxUnavailableError, type SandboxRunner } from './SandboxRunner';

class ScriptedRunner implements SandboxRunner {
  readonly name = 'scripted';
  readonly seen: ExecutionRequest[] = [];
  failure: Error | null = null;

  async run(
    request: ExecutionRequest,
    onChunk: (chunk: ExecutionChunk) => void,
  ): Promise<ExecutionResult> {
    this.seen.push(request);
    if (this.failure) {
      throw this.failure;
    }
    onChunk({ stream: 'stdout', text: 'hello\n' });
    onChunk({ stream: 'stderr', text: 'careful\n' });
    return { exitCode: 0, timedOut: false };
  }
}

describe('the execution endpoint', () => {
  let http: Server;
  let url: string;
  let runner: ScriptedRunner;

  const serve = async (execution: ExecutionService): Promise<void> => {
    const app = express();
    app.use(express.json());
    app.use(executionRouter(execution));
    http = app.listen(0);
    await once(http, 'listening');
    url = `http://localhost:${(http.address() as AddressInfo).port}/execute`;
  };

  const post = (body: unknown) =>
    fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  beforeEach(() => {
    runner = new ScriptedRunner();
  });

  afterEach(async () => {
    http.close();
    await once(http, 'close');
  });

  it('runs the submission and answers with its output', async () => {
    await serve(new ExecutionService(runner));

    const response = await post({ language: 'python', code: 'print(1)', roomId: 'room' });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      stdout: 'hello\n',
      stderr: 'careful\n',
      exitCode: 0,
      timedOut: false,
    });
  });

  it('rejects a language it cannot run', async () => {
    await serve(new ExecutionService(runner));

    const response = await post({ language: 'cobol', code: 'DISPLAY 1.' });

    expect(response.status).toBe(400);
    expect(runner.seen).toHaveLength(0);
  });

  it('answers 429 once the room has spent its allowance', async () => {
    const limiter = new RateLimiter({ burst: 1, refillMs: 60_000 });
    await serve(new ExecutionService(runner, limiter));
    const submission = { language: 'python', code: 'print(1)', roomId: 'room' };

    await post(submission);
    const response = await post(submission);

    expect(response.status).toBe(429);
    expect(runner.seen).toHaveLength(1);
  });

  it('answers 503 when no sandbox is configured', async () => {
    await serve(new ExecutionService(null));

    const response = await post({ language: 'python', code: 'print(1)' });

    expect(response.status).toBe(503);
  });

  it('answers 502 with whatever output arrived when the sandbox fails', async () => {
    runner.failure = new SandboxUnavailableError('docker could not be started');
    await serve(new ExecutionService(runner));

    const response = await post({ language: 'python', code: 'print(1)' });

    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ error: 'docker could not be started' });
  });

  it('advertises whether execution is available', async () => {
    await serve(new ExecutionService(runner));

    expect(await (await fetch(url)).json()).toEqual({ enabled: true, sandbox: 'scripted' });
  });
});
