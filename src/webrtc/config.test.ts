import { describe, expect, it } from 'vitest';
import { buildRtcConfiguration } from './config';

describe('buildRtcConfiguration', () => {
  it('includes a TURN relay so two phones behind NAT can still hear each other', () => {
    const ice = buildRtcConfiguration().iceServers ?? [];
    const turn = ice.find((server) => {
      const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
      return urls.some((url) => url.startsWith('turn:'));
    });

    expect(turn?.username).toBe('openrelayproject');
    expect(turn?.credential).toBe('openrelayproject');
  });
});
