export interface InviteTransport {
  sendSms(to: string, body: string): Promise<void>;
  sendEmail(to: string, subject: string, body: string): Promise<void>;
}

export type InviteEnv = Record<string, string | undefined>;

class UnconfiguredError extends Error {
  constructor(kind: 'sms' | 'email') {
    super(
      kind === 'sms'
        ? 'SMS invites are not configured on the server.'
        : 'Email invites are not configured on the server.',
    );
    this.name = 'UnconfiguredError';
  }
}

function notConfigured(kind: 'sms' | 'email'): () => Promise<never> {
  return async () => {
    throw new UnconfiguredError(kind);
  };
}

function read(env: InviteEnv, key: string): string {
  return env[key]?.trim() ?? '';
}

function twilioAuth(
  env: InviteEnv,
): { accountSid: string; username: string; password: string } | null {
  const accountSid = read(env, 'TWILIO_ACCOUNT_SID');
  if (accountSid === '' || !accountSid.startsWith('AC')) {
    return null;
  }
  const apiKey = read(env, 'TWILIO_API_KEY_SID');
  const apiSecret = read(env, 'TWILIO_API_KEY_SECRET');
  if (apiKey !== '' && apiSecret !== '') {
    return { accountSid, username: apiKey, password: apiSecret };
  }
  const token = read(env, 'TWILIO_AUTH_TOKEN');
  if (token !== '') {
    return { accountSid, username: accountSid, password: token };
  }
  return null;
}

function twilioSendSms(env: InviteEnv): InviteTransport['sendSms'] | null {
  const auth = twilioAuth(env);
  const from = read(env, 'TWILIO_FROM_NUMBER');
  if (!auth || from === '') {
    return null;
  }
  return async (to, body) => {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(auth.accountSid)}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
      },
    );
    if (!response.ok) {
      throw new Error(await describeFailure(response, 'The SMS could not be delivered.'));
    }
  };
}

function resendSendEmail(env: InviteEnv): InviteTransport['sendEmail'] | null {
  const key = read(env, 'RESEND_API_KEY');
  const from = read(env, 'RESEND_FROM');
  if (key === '' || from === '') {
    return null;
  }
  return async (to, subject, text) => {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to: [to], subject, text }),
    });
    if (!response.ok) {
      throw new Error(await describeFailure(response, 'The email could not be delivered.'));
    }
  };
}

async function describeFailure(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => ({}))) as { message?: unknown };
  return typeof body.message === 'string' && body.message.trim() !== '' ? body.message : fallback;
}

export function transportFromEnv(env: InviteEnv = process.env): InviteTransport {
  return {
    sendSms: twilioSendSms(env) ?? notConfigured('sms'),
    sendEmail: resendSendEmail(env) ?? notConfigured('email'),
  };
}

export function isUnconfigured(error: unknown): boolean {
  return error instanceof UnconfiguredError;
}
