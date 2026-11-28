import { describe, expect, it } from 'vitest';
import {
  FLOATING_MIN_WIDTH,
  clampWindow,
  initialWindow,
  movedWindow,
  resizedWindow,
  windowHeight,
} from './floatingWindow';

const bounds = { width: 1200, height: 700 };

describe('floating window', () => {
  it('opens in the top-right corner at the size it is asked for', () => {
    const rect = initialWindow(bounds);

    expect(rect.width).toBe(560);
    expect(rect.x + rect.width).toBeLessThanOrEqual(bounds.width);
    expect(rect.y).toBe(12);
    expect(initialWindow(bounds, 480).width).toBe(480);
    expect(initialWindow({ width: 400, height: 700 }).width).toBe(376);
  });

  it('follows the pointer anywhere on the stage', () => {
    const rect = movedWindow(initialWindow(bounds), -400, 200, bounds);

    expect(rect.x).toBe(228);
    expect(rect.y).toBe(212);
  });

  it('never leaves the stage', () => {
    const origin = initialWindow(bounds);
    const far = movedWindow(origin, 5000, 5000, bounds);
    const back = movedWindow(origin, -5000, -5000, bounds);

    expect(far.x).toBe(bounds.width - far.width);
    expect(far.y).toBeCloseTo(bounds.height - windowHeight(far.width));
    expect(back).toMatchObject({ x: 0, y: 0 });
  });

  it('grows from its corner until it meets the edge of the stage', () => {
    const origin = { x: 100, y: 50, width: 400 };

    expect(resizedWindow(origin, 200, bounds).width).toBe(600);
    expect(resizedWindow(origin, 5000, bounds)).toMatchObject({ x: 100, y: 50 });
    expect(resizedWindow(origin, 5000, bounds).width).toBeCloseTo((700 - 50 - 34) * (16 / 9));
  });

  it('does not shrink below a readable size', () => {
    expect(resizedWindow({ x: 0, y: 0, width: 400 }, -5000, bounds).width).toBe(FLOATING_MIN_WIDTH);
  });

  it('fits back inside a stage that became smaller', () => {
    const rect = clampWindow({ x: 900, y: 500, width: 560 }, { width: 500, height: 300 });

    expect(rect.x + rect.width).toBeLessThanOrEqual(500);
    expect(rect.y + windowHeight(rect.width)).toBeLessThanOrEqual(300.0001);
  });
});
