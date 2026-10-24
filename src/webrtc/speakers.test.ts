import { describe, expect, it } from 'vitest';
import type { ListedDevice } from './devices';
import { nextAudioOutput, outputKindLabel } from './speakers';

const outputs: ListedDevice[] = [
  { kind: 'audiooutput', deviceId: 'spk', label: 'MacBook Speakers' },
  { kind: 'audiooutput', deviceId: 'hp', label: 'USB Headphones' },
];

describe('speaker choice', () => {
  it('walks from the speakers to the headphones and back', () => {
    expect(nextAudioOutput(outputs, '')?.deviceId).toBe('spk');
    expect(nextAudioOutput(outputs, 'spk')?.deviceId).toBe('hp');
    expect(nextAudioOutput(outputs, 'hp')?.deviceId).toBe('spk');
  });

  it('names headphones from the device label', () => {
    expect(outputKindLabel('USB Headphones')).toBe('Headphones');
    expect(outputKindLabel('AirPods Pro')).toBe('Headphones');
    expect(outputKindLabel('MacBook Speakers')).toBe('Speaker');
    expect(outputKindLabel('')).toBe('Speaker');
  });
});
