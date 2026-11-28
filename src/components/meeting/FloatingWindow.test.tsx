// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FloatingWindow } from './FloatingWindow';

vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

afterEach(cleanup);

function setup() {
  const onExpand = vi.fn();
  const onDock = vi.fn();
  render(
    <FloatingWindow
      title="Ana's screen"
      bounds={{ width: 1200, height: 700 }}
      onExpand={onExpand}
      onDock={onDock}
    >
      <span>shared screen</span>
    </FloatingWindow>,
  );
  return { onExpand, onDock };
}

describe('FloatingWindow', () => {
  it('shows the shared screen in a window that can be moved and resized', () => {
    setup();

    expect(screen.getByText('shared screen')).toBeTruthy();
    expect(screen.getByText("Ana's screen")).toBeTruthy();
    expect(screen.getByLabelText('Drag to move')).toBeTruthy();
    expect(screen.getByLabelText('Drag to resize')).toBeTruthy();
  });

  it('opens inside the stage', () => {
    setup();

    const style = screen.getByLabelText("Ana's screen, movable window").style;

    expect(parseFloat(style.left) + parseFloat(style.width)).toBeLessThanOrEqual(1200);
    expect(parseFloat(style.top)).toBeGreaterThanOrEqual(0);
  });

  it('expands and returns to the strip from its title bar', () => {
    const { onExpand, onDock } = setup();

    fireEvent.click(screen.getByLabelText('Expand'));
    fireEvent.click(screen.getByLabelText('Return to the tile strip'));

    expect(onExpand).toHaveBeenCalledOnce();
    expect(onDock).toHaveBeenCalledOnce();
  });
});
