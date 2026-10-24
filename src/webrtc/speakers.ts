import type { ListedDevice } from './devices';

/** Playback devices, in the order the browser listed them. */
export function audioOutputs(devices: readonly ListedDevice[]): ListedDevice[] {
  return devices.filter((device) => device.kind === 'audiooutput');
}

/** The output after `currentId`, wrapping around. An unknown id starts at the first. */
export function nextAudioOutput(
  devices: readonly ListedDevice[],
  currentId: string,
): ListedDevice | null {
  const outputs = audioOutputs(devices);
  if (outputs.length === 0) {
    return null;
  }
  const index = outputs.findIndex((device) => device.deviceId === currentId);
  return outputs[(index + 1) % outputs.length] ?? null;
}

/** Headphones when the device name says so. Everything else is the speaker. */
export function outputKindLabel(label: string): 'Speaker' | 'Headphones' {
  if (/headphone|headset|earbud|earphone|airpod|buds/i.test(label)) {
    return 'Headphones';
  }
  return 'Speaker';
}
