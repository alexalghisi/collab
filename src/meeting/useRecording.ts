import { useCallback, useEffect, useRef, useState } from 'react';
import type { RemoteParticipant } from '../hooks/useCollabSession';
import { downloadBlob } from './download';
import { startRecording, type Recorder } from './recording';

export interface Recording {
  readonly active: boolean;
  start: () => void;
  /** Stops and downloads the file; also called when the meeting screen goes away. */
  stop: () => Promise<void>;
}

const fileName = (roomId: string) =>
  `collab-${roomId}-${new Date().toISOString().replace(/[:.]/g, '-')}.webm`;

export function useRecording(
  localStream: MediaStream | null,
  participants: RemoteParticipant[],
  roomId: string,
): Recording {
  const [active, setActive] = useState(false);
  const recorderRef = useRef<Recorder | null>(null);

  const remoteStreams = participants.flatMap((participant) =>
    participant.stream ? [participant.stream] : [],
  );

  // Late joiners must end up in the mix too.
  useEffect(() => {
    for (const stream of remoteStreams) {
      recorderRef.current?.addStream(stream);
    }
  }, [remoteStreams]);

  const start = useCallback(() => {
    if (!localStream || recorderRef.current) {
      return;
    }
    recorderRef.current = startRecording(localStream, remoteStreams);
    setActive(true);
  }, [localStream, remoteStreams]);

  const stop = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder) {
      return;
    }
    recorderRef.current = null;
    setActive(false);
    downloadBlob(fileName(roomId), await recorder.stop());
  }, [roomId]);

  useEffect(() => () => void stop(), [stop]);

  return { active, start, stop };
}
