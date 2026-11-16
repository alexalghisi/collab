import { afterEach, describe, expect, it, vi } from 'vitest';
import { isUnconfigured, transportFromEnv } from './senders';

describe('invite transport', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('treats a rejected Resend API key as unconfigured so clients fall back', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ message: 'API key is invalid' }), { status: 403 }),
      ),
    );
    const transport = transportFromEnv({ RESEND_API_KEY: 're_bad', RESEND_FROM: 'a@b.c' });
    const failure = await transport.sendEmail('x@y.z', 's', 'b').catch((cause: unknown) => cause);
    expect(isUnconfigured(failure)).toBe(true);
    expect((failure as Error).message).toBe('Email invites are not configured on the server.');
  });

  it('says email is not configured when Resend is missing', async () => {
    const transport = transportFromEnv({});
    await expect(transport.sendEmail('ada@example.com', 'Join', 'body')).rejects.toSatisfy(
      (error: unknown) => isUnconfigured(error) && (error as Error).message.includes('Email'),
    );
  });
});
