import { describe, expect, it } from 'vitest';
import { SignalingUnavailableError } from './SignalingChannel';
import { waitUntilSignalingReady } from './wake';

function ok(): Promise<Response> {
  return Promise.resolve(new Response('{"status":"ok"}', { status: 200 }));
}

describe('waitUntilSignalingReady', () => {
  it('does not fetch when the host is loopback', async () => {
    let hits = 0;
    const fetchImpl = async () => {
      hits += 1;
      return ok();
    };

    await waitUntilSignalingReady('http://localhost:4000', {
      fetchImpl,
      timeoutMs: 20,
      pauseMs: 1,
    });

    expect(hits).toBe(0);
  });

  it('returns after /health answers', async () => {
    const urls: string[] = [];
    const fetchImpl = async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return ok();
    };

    await waitUntilSignalingReady('https://collab-signaling.onrender.com/', {
      fetchImpl,
      timeoutMs: 20,
      pauseMs: 1,
    });

    expect(urls).toEqual(['https://collab-signaling.onrender.com/health']);
  });

  it('retries while the host is still waking', async () => {
    let hits = 0;
    const fetchImpl = async () => {
      hits += 1;
      if (hits < 3) {
        throw new Error('socket hang up');
      }
      return ok();
    };

    await waitUntilSignalingReady('https://signal.example', {
      fetchImpl,
      timeoutMs: 200,
      pauseMs: 1,
    });

    expect(hits).toBe(3);
  });

  it('rejects when health never settles and the request ignores abort', async () => {
    const fetchImpl = () => new Promise<Response>(() => undefined);
    const started = Date.now();

    const cause = await waitUntilSignalingReady('https://signal.example', {
      fetchImpl,
      timeoutMs: 40,
      pauseMs: 1,
      probeTimeoutMs: 1_000,
    }).catch((error: unknown) => error);

    expect(cause).toBeInstanceOf(SignalingUnavailableError);
    expect(Date.now() - started).toBeLessThan(400);
  });

  it('does not wait forever on a health request that never answers', async () => {
    const fetchImpl = (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });

    const cause = await waitUntilSignalingReady('https://signal.example', {
      fetchImpl,
      timeoutMs: 30,
      pauseMs: 1,
      probeTimeoutMs: 5,
    }).catch((error: unknown) => error);

    expect(cause).toBeInstanceOf(SignalingUnavailableError);
  });

  it('names the URL when health never comes up', async () => {
    const fetchImpl = async () => {
      throw new Error('ECONNRESET');
    };

    const cause = await waitUntilSignalingReady('https://signal.example', {
      fetchImpl,
      timeoutMs: 15,
      pauseMs: 1,
    }).catch((error: unknown) => error);

    expect(cause).toBeInstanceOf(SignalingUnavailableError);
    expect((cause as SignalingUnavailableError).url).toBe('https://signal.example');
  });
});
