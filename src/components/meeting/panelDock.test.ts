import { describe, expect, it } from 'vitest';
import { otherSide, readPanelSide, sideAfterDrop } from './panelDock';

describe('panel dock', () => {
  it('keeps the panel on the right until someone moves it', () => {
    expect(readPanelSide(null)).toBe('right');
    expect(readPanelSide('nonsense')).toBe('right');
    expect(readPanelSide('left')).toBe('left');
  });

  it('docks on the half of the window where the panel was dropped', () => {
    expect(sideAfterDrop(200, 1440)).toBe('left');
    expect(sideAfterDrop(719, 1440)).toBe('left');
    expect(sideAfterDrop(720, 1440)).toBe('right');
    expect(sideAfterDrop(1300, 1440)).toBe('right');
  });

  it('switches sides', () => {
    expect(otherSide('left')).toBe('right');
    expect(otherSide('right')).toBe('left');
  });
});
