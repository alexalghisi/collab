export interface InviteTransport {
  sendEmail(to: string, subject: string, body: string): Promise<void>;
}

export type InviteEnv = Record<string, string | undefined>;

class UnconfiguredError extends Error {
  constructor() {
    super('Email invites are not configured on the server.');
    this.name = 'UnconfiguredError';
  }
}

function notConfigured(): () => Promise<never> {
  return async () => {
    throw new UnconfiguredError();
  };
}

function read(env: InviteEnv, key: string): string {
  return env[key]?.trim() ?? '';
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
    if (rejectedCredentials(response)) {
      console.warn(`Resend rejected RESEND_API_KEY (HTTP ${response.status}).`);
      throw new UnconfiguredError();
    }
    if (!response.ok) {
      throw new Error(await describeFailure(response, 'The email could not be delivered.'));
    }
  };
}

/**
 * A revoked or mistyped provider key is a configuration problem, not a delivery
 * failure: report it as "not configured" so the client can say the platform
 * cannot send yet, instead of treating a bad key as a delivery error.
 */
function rejectedCredentials(response: Response): boolean {
  return response.status === 401 || response.status === 403;
}

async function describeFailure(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => ({}))) as { message?: unknown };
  return typeof body.message === 'string' && body.message.trim() !== '' ? body.message : fallback;
}

export function transportFromEnv(env: InviteEnv = process.env): InviteTransport {
  return {
    sendEmail: resendSendEmail(env) ?? notConfigured(),
  };
}

export function isUnconfigured(error: unknown): boolean {
  return error instanceof UnconfiguredError;
}
