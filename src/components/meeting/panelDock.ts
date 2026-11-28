import { createContext } from 'react';

export type PanelSide = 'left' | 'right';

export const PANEL_SIDE_KEY = 'collab.panelSide';
export const PANEL_DRAG_THRESHOLD = 6;

export interface PanelDock {
  readonly side: PanelSide;
  readonly setSide: (side: PanelSide) => void;
}

export const PanelDockContext = createContext<PanelDock | null>(null);

export function readPanelSide(raw: string | null): PanelSide {
  return raw === 'left' ? 'left' : 'right';
}

export function otherSide(side: PanelSide): PanelSide {
  return side === 'left' ? 'right' : 'left';
}

export function sideAfterDrop(pointerX: number, windowWidth: number): PanelSide {
  return pointerX < windowWidth / 2 ? 'left' : 'right';
}
