import { describe, expect, it } from 'vitest';
import { buildRtcConfiguration } from './config';

describe('buildRtcConfiguration', () => {
  it('lists public STUN servers and does not keep the retired Open Relay TURN', () => {
    const ice = buildRtcConfiguration().iceServers ?? [];
    const urls = ice.flatMap((server) =>
      Array.isArray(server.urls) ? server.urls : [server.urls],
    );

    expect(urls.some((url) => url.startsWith('stun:'))).toBe(true);
    expect(urls.some((url) => url.includes('openrelay'))).toBe(false);
  });
});
