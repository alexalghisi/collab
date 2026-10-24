import { clampEditorFont } from './callLayout';

interface TouchPoint {
  readonly clientX: number;
  readonly clientY: number;
}

interface ZoomTouchEvent {
  readonly touches: ArrayLike<TouchPoint>;
  preventDefault(): void;
}

interface ZoomWheelEvent {
  readonly ctrlKey: boolean;
  readonly deltaY: number;
  preventDefault(): void;
}

/** The part of a DOM element the zoom gestures need. */
export interface ZoomTarget {
  addEventListener(type: string, listener: (event: never) => void, options?: unknown): void;
  removeEventListener(type: string, listener: (event: never) => void): void;
}

function spread(event: ZoomTouchEvent): number {
  const a = event.touches[0];
  const b = event.touches[1];
  if (!a || !b) {
    return 0;
  }
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

/**
 * Pinch (two fingers) and Ctrl+wheel resize the editor text. The listeners are
 * attached once for the element; the size is read through `currentSize` so a
 * change of size during a pinch does not restart the gesture.
 */
export function attachEditorZoom(
  node: ZoomTarget,
  currentSize: () => number,
  setSize: (size: number) => void,
): () => void {
  let startDistance = 0;
  let startSize = currentSize();

  const onWheel = (event: ZoomWheelEvent): void => {
    if (!event.ctrlKey) {
      return;
    }
    event.preventDefault();
    setSize(clampEditorFont(currentSize() + (event.deltaY < 0 ? 1 : -1)));
  };
  const onTouchStart = (event: ZoomTouchEvent): void => {
    if (event.touches.length === 2) {
      startDistance = spread(event);
      startSize = currentSize();
    }
  };
  const onTouchMove = (event: ZoomTouchEvent): void => {
    if (event.touches.length !== 2 || startDistance <= 0) {
      return;
    }
    // Keep the browser from zooming the whole page under the editor.
    event.preventDefault();
    setSize(clampEditorFont(startSize * (spread(event) / startDistance)));
  };
  const onTouchEnd = (event: ZoomTouchEvent): void => {
    if (event.touches.length < 2) {
      startDistance = 0;
    }
  };

  node.addEventListener('wheel', onWheel, { passive: false });
  node.addEventListener('touchstart', onTouchStart, { passive: true });
  node.addEventListener('touchmove', onTouchMove, { passive: false });
  node.addEventListener('touchend', onTouchEnd);
  node.addEventListener('touchcancel', onTouchEnd);
  return () => {
    node.removeEventListener('wheel', onWheel);
    node.removeEventListener('touchstart', onTouchStart);
    node.removeEventListener('touchmove', onTouchMove);
    node.removeEventListener('touchend', onTouchEnd);
    node.removeEventListener('touchcancel', onTouchEnd);
  };
}
