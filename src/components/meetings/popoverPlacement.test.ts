import { describe, expect, it } from 'vitest';
import { placePopover } from './popoverPlacement';

describe('placePopover', () => {
  it('opens below the field when there is room', () => {
    expect(placePopover({ x: 40, y: 100, width: 220, height: 52 }, 1280, 800, 520, 560)).toEqual({
      top: 160,
      left: 40,
      width: 520,
      maxHeight: 560,
    });
  });

  it('shifts left so a wide calendar stays on screen', () => {
    const frame = placePopover({ x: 900, y: 100, width: 220, height: 52 }, 1100, 800, 520, 560);
    expect(frame.left).toBe(1100 - 12 - 520);
    expect(frame.width).toBe(520);
    expect(frame.top).toBe(160);
  });

  it('opens above the field when the bottom is too short', () => {
    const frame = placePopover({ x: 40, y: 700, width: 220, height: 52 }, 1280, 780, 520, 560);
    expect(frame.top).toBe(132);
    expect(frame.maxHeight).toBe(560);
    expect(frame.left).toBe(40);
  });

  it('shrinks to the viewport width', () => {
    const frame = placePopover({ x: 40, y: 100, width: 220, height: 52 }, 360, 700, 520, 560);
    expect(frame.width).toBe(360 - 24);
    expect(frame.left).toBe(12);
  });
});
