import { SignalingUnavailableError } from './SignalingChannel';

export interface WakeOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  pauseMs?: number;
}

export async function waitUntilSignalingReady(url: string, _options: WakeOptions = {}): Promise<void> {
  let hostname = '';
  try {
    hostname = new URL(url).hostname;
  } catch {
    throw new SignalingUnavailableError(url);
  }
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1') {
    return;
  }
  throw new SignalingUnavailableError(url);
}
