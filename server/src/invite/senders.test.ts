import { afterEach, describe, expect, it, vi } from 'vitest';
import { isUnconfigured, transportFromEnv } from './senders';

describe('invite transport', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts an SMS to Twilio when the account is configured', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    const transport = transportFromEnv({
      TWILIO_ACCOUNT_SID: 'ACxxx',
      TWILIO_AUTH_TOKEN: 'secret',
      TWILIO_FROM_NUMBER: '+18005551212',
    });
    await transport.sendSms('+40721123456', 'Join the call');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/Accounts/ACxxx/Messages.json'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('To=%2B40721123456'),
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ body: expect.stringContaining('From=%2B18005551212') }),
    );
  });

  it('says SMS is not configured when Twilio is missing', async () => {
    const transport = transportFromEnv({});
    await expect(transport.sendSms('+40721123456', 'Join')).rejects.toSatisfy(
      (error: unknown) => isUnconfigured(error) && (error as Error).message.includes('SMS'),
    );
  });
});
