// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TileSpotlight } from './TileSpotlight';

vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

afterEach(cleanup);

function setup() {
  const onClose = vi.fn();
  const onToggleMic = vi.fn();
  render(
    <TileSpotlight title="Ana" micOn onClose={onClose} onToggleMic={onToggleMic}>
      <span>shared screen</span>
    </TileSpotlight>,
  );
  return { onClose, onToggleMic };
}

describe('TileSpotlight', () => {
  it('shows the expanded tile and who it belongs to', () => {
    setup();

    expect(screen.getByText('shared screen')).toBeTruthy();
    expect(screen.getByText('Ana')).toBeTruthy();
  });

  it('goes back to the call from its close button', () => {
    const { onClose } = setup();

    fireEvent.click(screen.getByLabelText('Exit expanded view'));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('goes back to the call on Escape', () => {
    const { onClose } = setup();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('ignores other keys, which belong to whatever has focus', () => {
    const { onClose } = setup();

    fireEvent.keyDown(window, { key: 'a' });

    expect(onClose).not.toHaveBeenCalled();
  });

  it('still lets you mute without leaving the expanded view', () => {
    const { onToggleMic } = setup();

    fireEvent.click(screen.getByLabelText('Mute microphone'));

    expect(onToggleMic).toHaveBeenCalledOnce();
  });

  it('stops listening for Escape once closed', () => {
    const { onClose } = setup();
    cleanup();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onClose).not.toHaveBeenCalled();
  });
});
