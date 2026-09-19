export interface IceServerConfig {
  readonly urls: string | string[];
  readonly username?: string;
  readonly credential?: string;
}

export const DEFAULT_ICE_SERVERS: readonly IceServerConfig[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

export function buildRtcConfiguration(
  iceServers: readonly IceServerConfig[] = DEFAULT_ICE_SERVERS,
): RTCConfiguration {
  return {
    iceServers: iceServers.map((server) => ({
      urls: server.urls,
      username: server.username,
      credential: server.credential,
    })),
    iceCandidatePoolSize: 10,
    bundlePolicy: 'max-bundle',
  };
}
