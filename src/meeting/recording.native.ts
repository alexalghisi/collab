import type { Recorder } from './recording';

export type { Recorder };

/** MediaRecorder is a browser API; the native apps hide the recording control. */
export const CAN_RECORD = false;

export function startRecording(_localStream: MediaStream, _remoteStreams: MediaStream[]): Recorder {
  throw new Error('Recording is only available on the web.');
}
