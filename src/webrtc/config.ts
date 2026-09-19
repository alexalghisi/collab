export interface IceServerConfig {
  readonly urls: string | string[];
  readonly username?: string;
  readonly credential?: string;
}

const DEFAULT_ICE_SERVERS: readonly IceServerConfig[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  {
    urls: [
      'turn:openrelay.metered.ca:80',
      'turn:openrelay.metered.ca:443',
      'turn:openrelay.metered.ca:443?transport=tcp',
    ],
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
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
