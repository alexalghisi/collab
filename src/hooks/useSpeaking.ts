import { useEffect, useState } from 'react';
import { openMicLevel, speakingFromLevel } from '../webrtc/micMeter';

/** True while this track is carrying a voice. The meter is not played back. */
export function useSpeaking(track: MediaStreamTrack | undefined, enabled: boolean): boolean {
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    if (!enabled || !track) {
      setSpeaking(false);
      return;
    }
    const meter = openMicLevel(track);
    if (!meter) {
      setSpeaking(false);
      return;
    }
    let frame = 0;
    let current = false;
    const tick = (): void => {
      const next = speakingFromLevel(current, meter.sample());
      if (next !== current) {
        current = next;
        setSpeaking(next);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const resume = (): void => {
      void meter.resume();
    };
    window.addEventListener?.('pointerdown', resume);
    return () => {
      cancelAnimationFrame(frame);
      meter.stop();
      window.removeEventListener?.('pointerdown', resume);
    };
  }, [enabled, track]);

  return speaking;
}
