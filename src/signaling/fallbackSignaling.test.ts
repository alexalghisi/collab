import { describe, expect, it, vi } from 'vitest';
import { FallbackChannel } from './fallbackSignaling';
import type { SignalingChannel } from './SignalingChannel';

function stub(overrides: Partial<SignalingChannel> = {}): SignalingChannel & {
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
} {
  return {
    on: vi.fn(),
    emit: vi.fn(),
    connect: vi.fn(async () => undefined),
    disconnect: vi.fn(),
    upload: vi.fn(),
    sendInvite: vi.fn(),
    ...overrides,
  };
}

describe('FallbackChannel', () => {
  it('stays on the primary transport when it connects', async () => {
    const primary = stub();
    const secondary = stub();
    const channel = new FallbackChannel(primary, secondary);
    await channel.connect();
    channel.emit('notes:update', 'hi');
    expect(primary.connect).toHaveBeenCalledOnce();
    expect(secondary.connect).not.toHaveBeenCalled();
    expect(primary.emit).toHaveBeenCalledWith('notes:update', 'hi');
  });

  it('dials the socket after Firestore connect fails', async () => {
    const primary = stub({
      connect: vi.fn(async () => {
        throw new Error('permission-denied');
      }),
    });
    const secondary = stub();
    const channel = new FallbackChannel(primary, secondary);
    await channel.connect();
    channel.emit('notes:update', 'hi');
    expect(primary.disconnect).toHaveBeenCalled();
    expect(secondary.connect).toHaveBeenCalledOnce();
    expect(secondary.emit).toHaveBeenCalledWith('notes:update', 'hi');
  });
});
