import { DEFAULT_ICE_SERVERS, type IceServerConfig } from '../../src/webrtc/config';

interface TwilioIceServer {
  readonly urls?: string | string[];
  readonly url?: string;
  readonly username?: string;
  readonly credential?: string;
}

export async function resolveIceServers(
  env: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<IceServerConfig[]> {
  const accountSid = env.TWILIO_ACCOUNT_SID?.trim() ?? '';
  const token = env.TWILIO_AUTH_TOKEN?.trim() ?? '';
  if (accountSid === '' || token === '') {
    return [...DEFAULT_ICE_SERVERS];
  }
  try {
    const response = await fetchImpl(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Tokens.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${token}`).toString('base64')}`,
        },
      },
    );
    if (!response.ok) {
      return [...DEFAULT_ICE_SERVERS];
    }
    const body = (await response.json()) as { ice_servers?: TwilioIceServer[] };
    const mapped = (body.ice_servers ?? [])
      .map((server) => ({
        urls: server.urls ?? server.url ?? '',
        username: server.username,
        credential: server.credential,
      }))
      .filter((server) => server.urls !== '');
    return mapped.length > 0 ? mapped : [...DEFAULT_ICE_SERVERS];
  } catch {
    return [...DEFAULT_ICE_SERVERS];
  }
}
