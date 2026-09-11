/**
 * Local meeting recording (web only): our own video track plus the audio of
 * everyone in the call, mixed through an AudioContext into a single WebM file.
 */
export const CAN_RECORD = typeof MediaRecorder !== 'undefined';

export interface Recorder {
  /** Mixes the audio of a stream that arrived after recording started. */
  addStream: (stream: MediaStream) => void;
  /** Resolves with the finished file once the encoder has flushed. */
  stop: () => Promise<Blob>;
}

const MIME_TYPE = 'video/webm';

export function startRecording(localStream: MediaStream, remoteStreams: MediaStream[]): Recorder {
  const context = new AudioContext();
  const mix = context.createMediaStreamDestination();
  const mixed = new Set<string>();

  const addStream = (stream: MediaStream): void => {
    if (mixed.has(stream.id) || stream.getAudioTracks().length === 0) {
      return;
    }
    mixed.add(stream.id);
    context.createMediaStreamSource(stream).connect(mix);
  };
  for (const stream of [localStream, ...remoteStreams]) {
    addStream(stream);
  }

  const recorder = new MediaRecorder(
    new MediaStream([...localStream.getVideoTracks(), ...mix.stream.getAudioTracks()]),
    { mimeType: MIME_TYPE },
  );
  const chunks: Blob[] = [];
  recorder.addEventListener('dataavailable', (event) => {
    if (event.data.size > 0) {
      chunks.push(event.data);
    }
  });
  recorder.start();

  return {
    addStream,
    stop: () =>
      new Promise((resolve) => {
        recorder.addEventListener('stop', () => {
          void context.close();
          resolve(new Blob(chunks, { type: MIME_TYPE }));
        });
        recorder.stop();
      }),
  };
}
