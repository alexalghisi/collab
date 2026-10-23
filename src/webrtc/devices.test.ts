import { afterEach, describe, expect, it, vi } from 'vitest';
import { listMediaDevices, watchDeviceChanges } from './devices';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('listMediaDevices', () => {
  it('keeps labeled cameras, microphones and speakers', async () => {
    const enumerateDevices = vi.fn(async () => [
      { kind: 'videoinput', deviceId: 'cam', label: 'FaceTime' },
      { kind: 'audioinput', deviceId: 'mic', label: '' },
      { kind: 'audiooutput', deviceId: 'spk', label: 'Speakers' },
      { kind: 'audioinput', deviceId: '', label: 'default' },
    ]);
    vi.stubGlobal('navigator', { mediaDevices: { enumerateDevices } });

    await expect(listMediaDevices()).resolves.toEqual([
      { kind: 'videoinput', deviceId: 'cam', label: 'FaceTime' },
      { kind: 'audioinput', deviceId: 'mic', label: 'Microphone 1' },
      { kind: 'audiooutput', deviceId: 'spk', label: 'Speakers' },
    ]);
  });

  it('is empty when the browser has no device list', async () => {
    vi.stubGlobal('navigator', {});

    await expect(listMediaDevices()).resolves.toEqual([]);
  });
});

describe('watchDeviceChanges', () => {
  it('subscribes to devicechange and unsubscribes on cleanup', () => {
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    vi.stubGlobal('navigator', { mediaDevices: { addEventListener, removeEventListener } });
    const onChange = () => undefined;

    const stop = watchDeviceChanges(onChange);
    stop();

    expect(addEventListener).toHaveBeenCalledWith('devicechange', onChange);
    expect(removeEventListener).toHaveBeenCalledWith('devicechange', onChange);
  });
});
