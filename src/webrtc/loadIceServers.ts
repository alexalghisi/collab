import { DEFAULT_ICE_SERVERS, type IceServerConfig } from './config';

const ICE_WAIT_MS = 2500;
const PUBLIC_TURN_URL = 'https://turn.elixir-webrtc.org/?service=turn&username=collab';

export async function loadIceServers(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<readonly IceServerConfig[]> {
  const hosted = await readJson(
    fetchImpl,
    `${baseUrl.replace(/\/$/, '')}/ice`,
    (body: { iceServers?: IceServerConfig[] }) =>
      body.iceServers && body.iceServers.length > 0 ? body.iceServers : null,
  );
  if (hosted) {
    return hosted;
  }
  const relay = await readJson(
    fetchImpl,
    PUBLIC_TURN_URL,
    (body: { uris?: string[]; username?: string; password?: string }) => {
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
    },
    'POST',
  );
  return relay ?? DEFAULT_ICE_SERVERS;
}

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

async function readJson<T>(
  fetchImpl: typeof fetch,
  url: string,
  pick: (body: T) => IceServerConfig[] | null,
  method = 'GET',
): Promise<IceServerConfig[] | null> {
  try {
    const response = await fetchImpl(url, { method, signal: AbortSignal.timeout(ICE_WAIT_MS) });
    if (!response.ok) {
      return null;
    }
    return pick((await response.json()) as T);
  } catch {
    return null;
  }
}
