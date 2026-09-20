import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startRoomServer, until, type RoomServer } from '../testing/roomServer';
import { ExecutionService } from '../../server/src/execution/ExecutionService';
import type { SandboxRunner } from '../../server/src/execution/SandboxRunner';
import type { RunFinished, RunOutput, RunStarted } from '../code/execution';

const runner: SandboxRunner = {
  name: 'fake',
  async run(_request, onChunk) {
    onChunk({ stream: 'stdout', text: 'live output\n' });
    return { exitCode: 0, timedOut: false, files: [] };
  },
};

describe('a code run is shared live with the whole room', () => {
  let server: RoomServer;

  beforeEach(async () => {
    server = await startRoomServer(new ExecutionService(runner));
  });

  afterEach(async () => {
    await server.stop();
  });

  it('streams a run started by one participant to another, with output and result', async () => {
    const host = await server.join('a', 'Ada');
    const guest = await server.join('b', 'Linus');

    const started: RunStarted[] = [];
    const output: RunOutput[] = [];
    const finished: RunFinished[] = [];
    guest.channel.on('code:run:started', (event) => started.push(event));
    guest.channel.on('code:output', (event) => output.push(event));
    guest.channel.on('code:run:finished', (event) => finished.push(event));

    host.channel.emit('code:run', {
      language: 'javascript',
      code: "console.log('hi')",
      stdin: '',
      files: [],
    });

    await until(() => finished.length > 0);

    expect(started).toHaveLength(1);
    expect(started[0].byDisplayName).toBe('Ada');
    expect(started[0].language).toBe('javascript');
    expect(output.map((chunk) => chunk.text).join('')).toBe('live output\n');
    expect(finished[0].runId).toBe(started[0].runId);
    expect(finished[0].exitCode).toBe(0);
  });
});
