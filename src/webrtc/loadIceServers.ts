import { DEFAULT_ICE_SERVERS, type IceServerConfig } from './config';

export async function loadIceServers(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<readonly IceServerConfig[]> {
  try {
    const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/ice`);
    if (!response.ok) {
      return DEFAULT_ICE_SERVERS;
    }
    const body = (await response.json()) as { iceServers?: IceServerConfig[] };
    return body.iceServers && body.iceServers.length > 0 ? body.iceServers : DEFAULT_ICE_SERVERS;
  } catch {
    return DEFAULT_ICE_SERVERS;
  }
}
