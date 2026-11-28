// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PanelDockContext, type PanelSide } from './panelDock';
import { SidePanel } from './SidePanel';

vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

afterEach(cleanup);

function setup(side: PanelSide | null) {
  const setSide = vi.fn();
  const onClose = vi.fn();
  render(
    <PanelDockContext.Provider value={side ? { side, setSide } : null}>
      <SidePanel title="Chat" onClose={onClose}>
        <span>messages</span>
      </SidePanel>
    </PanelDockContext.Provider>,
  );
  return { setSide, onClose };
}

describe('SidePanel', () => {
  it('moves from the right of the call to the left', () => {
    const { setSide } = setup('right');

    fireEvent.click(screen.getByLabelText('Move panel to the left'));

    expect(setSide).toHaveBeenCalledWith('left');
  });

  it('moves back to the right', () => {
    const { setSide } = setup('left');

    fireEvent.click(screen.getByLabelText('Move panel to the right'));

    expect(setSide).toHaveBeenCalledWith('right');
  });

  it('stays put where the panel covers the whole call', () => {
    setup(null);

    expect(screen.queryByLabelText('Move panel to the left')).toBeNull();
    expect(screen.getByText('messages')).toBeTruthy();
  });

  it('still closes', () => {
    const { onClose } = setup('right');

    fireEvent.click(screen.getByLabelText('Close panel'));

    expect(onClose).toHaveBeenCalledOnce();
  });
});
