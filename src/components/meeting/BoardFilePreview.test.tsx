// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BoardFile } from '../../signaling/events';
import { forgetBoardText, rememberBoardText } from '../../whiteboard/boardText';
import { BoardFilePreview } from './BoardFilePreview';

vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

beforeEach(forgetBoardText);
afterEach(cleanup);

function item(mimeType: string, name: string): BoardFile {
  return {
    id: 'board-1',
    peerId: 'peer-1',
    file: { id: 'file-1', name, mimeType, size: 24, url: 'https://files.test/file-1' },
    x: 0.1,
    y: 0.1,
    w: 0.34,
    h: 0.32,
  };
}

describe('BoardFilePreview', () => {
  it('renders pasted text on the board', async () => {
    rememberBoardText('file-1', 'f(97,0)\nf(48,1)');

    render(
      <BoardFilePreview
        item={item('text/plain', 'Pasted text.txt')}
        owned
        onOpen={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    expect(await screen.findByText(/f\(97,0\)/)).toBeTruthy();
  });

  it('falls back to a file card when the text cannot be fetched', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('gone', { status: 404 })),
    );

    render(
      <BoardFilePreview
        item={item('text/plain', 'notes.txt')}
        owned={false}
        onOpen={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    expect(await screen.findByText('notes.txt')).toBeTruthy();
    vi.unstubAllGlobals();
  });

  it('keeps showing other files as a card', () => {
    render(
      <BoardFilePreview
        item={item('application/zip', 'archive.zip')}
        owned={false}
        onOpen={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    expect(screen.getByText('archive.zip')).toBeTruthy();
  });
});
