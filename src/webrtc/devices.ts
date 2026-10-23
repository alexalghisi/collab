export type DeviceKind = 'audioinput' | 'videoinput' | 'audiooutput';

export interface ListedDevice {
  readonly deviceId: string;
  readonly kind: DeviceKind;
  readonly label: string;
}

const KINDS = new Set<string>(['audioinput', 'videoinput', 'audiooutput']);

function fallbackLabel(kind: DeviceKind, index: number): string {
  if (kind === 'videoinput') {
    return `Camera ${index + 1}`;
  }
  if (kind === 'audiooutput') {
    return `Speaker ${index + 1}`;
  }
  return `Microphone ${index + 1}`;
}

export async function listMediaDevices(): Promise<ListedDevice[]> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
    return [];
  }
  const found = await navigator.mediaDevices.enumerateDevices();
  const counts: Record<DeviceKind, number> = { audioinput: 0, videoinput: 0, audiooutput: 0 };
  const listed: ListedDevice[] = [];
  for (const device of found) {
    if (!KINDS.has(device.kind) || device.deviceId === '') {
      continue;
    }
    const kind = device.kind as DeviceKind;
    listed.push({
      deviceId: device.deviceId,
      kind,
      label: device.label.trim() || fallbackLabel(kind, counts[kind]),
    });
    counts[kind] += 1;
  }
  return listed;
}

export function watchDeviceChanges(onChange: () => void): () => void {
  const target = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices;
  if (!target?.addEventListener) {
    return () => undefined;
  }
  target.addEventListener('devicechange', onChange);
  return () => target.removeEventListener('devicechange', onChange);
}
