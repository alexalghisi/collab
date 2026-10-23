import { timeoutSignal } from '../net/timeoutSignal';
import { DEFAULT_ICE_SERVERS, type IceServerConfig } from './config';

const ICE_WAIT_MS = 8000;

/**
 * Asks our signaling server for ICE servers. The browser must not call a
 * third-party TURN host itself: that request is cross-origin and shows up as
 * a CORS error, which leaves a phone on 4G with STUN only.
 */
export async function loadIceServers(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<readonly IceServerConfig[]> {
  try {
    const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/ice`, {
      signal: timeoutSignal(ICE_WAIT_MS),
    });
    if (!response.ok) {
      return DEFAULT_ICE_SERVERS;
    }
    const body = (await response.json()) as { iceServers?: IceServerConfig[] };
    if (body.iceServers && body.iceServers.length > 0) {
      console.info(
        '[collab] ice servers',
        body.iceServers.map((server) => server.urls),
      );
      return body.iceServers;
    }
  } catch (cause) {
    console.info('[collab] ice servers unavailable', cause);
  }
  return DEFAULT_ICE_SERVERS;
}
