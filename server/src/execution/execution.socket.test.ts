import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type {
  ExecutionChunk,
  ExecutionRequest,
  ExecutionResult,
  RunFinished,
  RunOutput,
  RunStarted,
} from '../../../src/code/execution';
import { MAX_CODE_BYTES } from '../../../src/code/execution';
import { settle, startRoomServer, until, type RoomServer } from '../../../src/testing/roomServer';
import { ExecutionService } from './ExecutionService';
import { RateLimiter } from './RateLimiter';
import { SandboxUnavailableError, type SandboxRunner } from './SandboxRunner';

/** Stands in for a sandbox: the isolation itself is covered by the runner tests. */
class ScriptedRunner implements SandboxRunner {
  readonly name = 'scripted';
  readonly seen: ExecutionRequest[] = [];
  chunks: ExecutionChunk[] = [{ stream: 'stdout', text: 'ok\n' }];
  result: ExecutionResult = { exitCode: 0, timedOut: false };
  failure: Error | null = null;

  async run(
    request: ExecutionRequest,
    onChunk: (chunk: ExecutionChunk) => void,
  ): Promise<ExecutionResult> {
    this.seen.push(request);
    if (this.failure) {
      throw this.failure;
    }
    for (const chunk of this.chunks) {
      onChunk(chunk);
    }
    return this.result;
  }
}

interface Recorder {
  readonly started: RunStarted[];
  readonly output: RunOutput[];
  readonly finished: RunFinished[];
}

describe('running code from the meeting', () => {
  let server: RoomServer;
  let runner: ScriptedRunner;
  let clock: { now: number };

  const request: ExecutionRequest = { language: 'python', code: 'print(1)', stdin: '' };

  const record = (channel: Awaited<ReturnType<RoomServer['join']>>['channel']): Recorder => {
    const recorder: Recorder = { started: [], output: [], finished: [] };
    channel.on('code:run:started', (payload) => recorder.started.push(payload));
    channel.on('code:output', (payload) => recorder.output.push(payload));
    channel.on('code:run:finished', (payload) => recorder.finished.push(payload));
    return recorder;
  };

  beforeEach(async () => {
    runner = new ScriptedRunner();
    clock = { now: 0 };
    const limiter = new RateLimiter({ burst: 2, refillMs: 1000 }, () => clock.now);
    server = await startRoomServer(new ExecutionService(runner, limiter));
  });

  afterEach(async () => {
    await server.stop();
  });

  it('reports a run to the whole room, attributed to whoever started it', async () => {
    const ada = await server.join('a', 'Ada');
    const linus = await server.join('b', 'Linus');
    const watching = record(linus.channel);
    const running = record(ada.channel);

    ada.channel.emit('code:run', request);
    await until(() => watching.finished.length === 1 && running.started.length === 1);

    expect(watching.started).toHaveLength(1);
    expect(watching.started[0].byDisplayName).toBe('Ada');
    expect(watching.started[0].language).toBe('python');
    expect(watching.output.map((entry) => entry.text)).toEqual(['ok\n']);
    expect(watching.finished[0]).toMatchObject({ exitCode: 0, timedOut: false, error: null });
    expect(running.started[0].runId).toBe(watching.started[0].runId);
  });

  it('passes the submitted code and input to the sandbox', async () => {
    const ada = await server.join('a', 'Ada');

    ada.channel.emit('code:run', { ...request, stdin: '41\n' });
    await settle();

    expect(runner.seen).toEqual([{ language: 'python', code: 'print(1)', stdin: '41\n' }]);
  });

  it('reports a timeout as a finished run rather than an error', async () => {
    const ada = await server.join('a', 'Ada');
    const recorder = record(ada.channel);
    runner.result = { exitCode: null, timedOut: true };

    ada.channel.emit('code:run', { ...request, code: 'while True: pass' });
    await settle();

    expect(recorder.finished[0]).toMatchObject({ timedOut: true, exitCode: null, error: null });
  });

  it('reports an unusable sandbox as a failed run', async () => {
    const ada = await server.join('a', 'Ada');
    const recorder = record(ada.channel);
    runner.failure = new SandboxUnavailableError('docker could not be started');

    ada.channel.emit('code:run', request);
    await settle();

    expect(recorder.finished[0].error).toContain('docker could not be started');
  });

  it('refuses an oversized submission without troubling the sandbox', async () => {
    const ada = await server.join('a', 'Ada');
    const recorder = record(ada.channel);

    ada.channel.emit('code:run', { ...request, code: 'x'.repeat(MAX_CODE_BYTES + 1) });
    await settle();

    expect(runner.seen).toHaveLength(0);
    expect(recorder.finished[0].error).toContain('too large');
  });

  it('tells only the sender when a run is refused', async () => {
    const ada = await server.join('a', 'Ada');
    const linus = await server.join('b', 'Linus');
    const watching = record(linus.channel);

    ada.channel.emit('code:run', { ...request, code: '  ' });
    await settle();

    expect(watching.started).toHaveLength(0);
    expect(watching.finished).toHaveLength(0);
  });

  it('rate-limits a participant who holds the Run button down', async () => {
    const ada = await server.join('a', 'Ada');
    const recorder = record(ada.channel);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      ada.channel.emit('code:run', request);
    }
    await settle();

    expect(runner.seen).toHaveLength(2);
    expect(recorder.finished.map((entry) => entry.error)).toContain(
      'Too many runs in a row — wait a moment and try again.',
    );
  });

  it('lets the participant run again once the allowance refills', async () => {
    const ada = await server.join('a', 'Ada');

    ada.channel.emit('code:run', request);
    ada.channel.emit('code:run', request);
    ada.channel.emit('code:run', request);
    await settle();
    clock.now = 2000;
    ada.channel.emit('code:run', request);
    await settle();

    expect(runner.seen).toHaveLength(3);
  });

  it('stops a removed participant running anything', async () => {
    const host = await server.join('a', 'Ada');
    const guest = await server.join('b', 'Linus');
    const recorder = record(guest.channel);
    host.channel.emit('host:command', {
      targetPeerId: guest.joined.selfPeerId,
      command: { action: 'remove' },
    });
    await settle();

    guest.channel.emit('code:run', request);
    await settle();

    expect(runner.seen).toHaveLength(0);
    expect(recorder.finished.at(-1)?.error).toContain('no longer in this meeting');
  });

  it('refuses every run when no sandbox is configured', async () => {
    await server.stop();
    server = await startRoomServer(new ExecutionService(null));
    const ada = await server.join('a', 'Ada');
    const recorder = record(ada.channel);

    ada.channel.emit('code:run', request);
    await settle();

    expect(recorder.finished[0].error).toContain('not enabled');
  });
});
