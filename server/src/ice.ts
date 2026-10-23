import { DEFAULT_ICE_SERVERS, type IceServerConfig } from '../../src/webrtc/config';

interface TwilioIceServer {
  readonly urls?: string | string[];
  readonly url?: string;
  readonly username?: string;
  readonly credential?: string;
}

const PUBLIC_TURN_URL = 'https://turn.elixir-webrtc.org/?service=turn&username=collab';

/** UDP-only relays fail on many mobile networks; ask for TCP on the same host. */
function withTcpTurn(uris: readonly string[]): string[] {
  const urls = new Set(uris);
  for (const uri of uris) {
    if (uri.includes('transport=udp')) {
      urls.add(uri.replace('transport=udp', 'transport=tcp'));
    }
  }
  return [...urls];
}

async function readPublicRelay(fetchImpl: typeof fetch): Promise<IceServerConfig[] | null> {
  try {
    const response = await fetchImpl(PUBLIC_TURN_URL, { method: 'POST' });
    if (!response.ok) {
      return null;
    }
    const body = (await response.json()) as {
      uris?: string[];
      username?: string;
      password?: string;
    };
    if (!body.uris?.length || !body.username || !body.password) {
      return null;
    }
    return [
      ...DEFAULT_ICE_SERVERS,
      {
        urls: withTcpTurn(body.uris),
        username: body.username,
        credential: body.password,
      },
    ];
  } catch {
    return null;
  }
}

export async function resolveIceServers(
  env: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<IceServerConfig[]> {
  const accountSid = env.TWILIO_ACCOUNT_SID?.trim() ?? '';
  const token = env.TWILIO_AUTH_TOKEN?.trim() ?? '';
  if (accountSid === '' || token === '') {
    return (await readPublicRelay(fetchImpl)) ?? [...DEFAULT_ICE_SERVERS];
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
