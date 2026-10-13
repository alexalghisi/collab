export interface AnchorBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PopoverFrame {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
}

const MARGIN = 12;
const GAP = 8;

/** Places a dropdown under its field, flipping above or shrinking to stay on screen. */
export function placePopover(
  anchor: AnchorBox,
  windowWidth: number,
  windowHeight: number,
  preferredWidth: number,
  preferredHeight: number,
): PopoverFrame {
  const width = Math.min(preferredWidth, Math.max(0, windowWidth - MARGIN * 2));
  let left = anchor.x;
  if (left + width > windowWidth - MARGIN) {
    left = windowWidth - MARGIN - width;
  }
  left = Math.max(MARGIN, left);

  const belowTop = anchor.y + anchor.height + GAP;
  const spaceBelow = Math.max(0, windowHeight - MARGIN - belowTop);
  const spaceAbove = Math.max(0, anchor.y - MARGIN - GAP);
  const openBelow = spaceBelow >= spaceAbove;
  const available = openBelow ? spaceBelow : spaceAbove;
  const maxHeight = Math.min(preferredHeight, available);
  const top = openBelow ? belowTop : Math.max(MARGIN, anchor.y - GAP - maxHeight);

  return { top, left, width, maxHeight };
}
