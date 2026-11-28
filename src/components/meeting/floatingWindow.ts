export interface WindowRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
}

export interface WindowBounds {
  readonly width: number;
  readonly height: number;
}

export const FLOATING_TITLE_HEIGHT = 34;
export const FLOATING_MIN_WIDTH = 220;
const SCREEN_ASPECT = 16 / 9;
const INSET = 12;
export const FLOATING_INITIAL_WIDTH = 560;

export function windowHeight(width: number): number {
  return width / SCREEN_ASPECT + FLOATING_TITLE_HEIGHT;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

export function clampWindow(rect: WindowRect, bounds: WindowBounds): WindowRect {
  const widest = Math.max(
    1,
    Math.min(bounds.width, (bounds.height - FLOATING_TITLE_HEIGHT) * SCREEN_ASPECT),
  );
  const width = clamp(rect.width, Math.min(FLOATING_MIN_WIDTH, widest), widest);
  return {
    width,
    x: clamp(rect.x, 0, bounds.width - width),
    y: clamp(rect.y, 0, bounds.height - windowHeight(width)),
  };
}

export function initialWindow(
  bounds: WindowBounds,
  preferredWidth: number = FLOATING_INITIAL_WIDTH,
): WindowRect {
  const width = Math.min(preferredWidth, bounds.width - 2 * INSET);
  return clampWindow({ width, x: bounds.width - width - INSET, y: INSET }, bounds);
}

export function movedWindow(
  origin: WindowRect,
  dx: number,
  dy: number,
  bounds: WindowBounds,
): WindowRect {
  return clampWindow({ ...origin, x: origin.x + dx, y: origin.y + dy }, bounds);
}

export function resizedWindow(origin: WindowRect, dx: number, bounds: WindowBounds): WindowRect {
  const room = Math.min(
    bounds.width - origin.x,
    (bounds.height - origin.y - FLOATING_TITLE_HEIGHT) * SCREEN_ASPECT,
  );
  const width = clamp(origin.width + dx, Math.min(FLOATING_MIN_WIDTH, room), room);
  return clampWindow({ ...origin, width }, bounds);
}
