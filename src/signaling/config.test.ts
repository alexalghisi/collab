import { describe, expect, it } from 'vitest';
import { resolveSignalingUrl, type PageLocation } from './config';

const page = (hostname: string, port: string, protocol = 'http:'): PageLocation => ({
  protocol,
  hostname,
  port,
  origin: `${protocol}//${hostname}${port ? `:${port}` : ''}`,
});

describe('resolveSignalingUrl', () => {
  it('uses the configured URL when one is set, ignoring the page host', () => {
    expect(resolveSignalingUrl('https://signal.example:8443/', page('10.0.0.4', '8081'))).toBe(
      'https://signal.example:8443',
    );
  });

  it('treats whitespace-only configuration as unset', () => {
    expect(resolveSignalingUrl('   ', page('localhost', '8081'))).toBe('http://localhost:4000');
  });

  it('stays on the page origin when the signaling process served the app', () => {
    expect(resolveSignalingUrl(undefined, page('127.0.0.1', '4000'))).toBe('http://127.0.0.1:4000');
    expect(resolveSignalingUrl(undefined, page('collab.local', '4000', 'https:'))).toBe(
      'https://collab.local:4000',
    );
  });

  it('aims at the local signaling port from a loopback preview on another port', () => {
    expect(resolveSignalingUrl(undefined, page('localhost', '8081'))).toBe('http://localhost:4000');
    expect(resolveSignalingUrl(undefined, page('127.0.0.1', '4173'))).toBe('http://localhost:4000');
    expect(resolveSignalingUrl(undefined, page('[::1]', '8081'))).toBe('http://localhost:4000');
  });

  it('aims at the same host on the signaling port from a LAN preview', () => {
    expect(resolveSignalingUrl(undefined, page('192.168.1.20', '8081'))).toBe(
      'http://192.168.1.20:4000',
    );
    expect(resolveSignalingUrl(undefined, page('studio.local', '8081', 'https:'))).toBe(
      'https://studio.local:4000',
    );
  });

  it('falls back to the local signaling port with no page location', () => {
    expect(resolveSignalingUrl(undefined)).toBe('http://localhost:4000');
    expect(resolveSignalingUrl('')).toBe('http://localhost:4000');
  });

  it('falls back to the local signaling port on a public site with no port', () => {
    expect(resolveSignalingUrl(undefined, page('alexalghisi.github.io', '', 'https:'))).toBe(
      'http://localhost:4000',
    );
  });

  it('uses the page origin when a tunnel or custom host served the app', () => {
    expect(resolveSignalingUrl(undefined, page('demo.trycloudflare.com', '', 'https:'))).toBe(
      'https://demo.trycloudflare.com',
    );
  });
});
