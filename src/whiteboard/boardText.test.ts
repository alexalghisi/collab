import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_BOARD_TEXT_CHARS,
  forgetBoardText,
  isTextMime,
  loadBoardText,
  pastePoint,
  pastedText,
  rememberBoardText,
  trimBoardText,
} from './boardText';

beforeEach(forgetBoardText);

describe('board text', () => {
  it('treats plain text, markdown, csv and json as readable on the board', () => {
    expect(isTextMime('text/plain')).toBe(true);
    expect(isTextMime('text/markdown; charset=utf-8')).toBe(true);
    expect(isTextMime('text/csv')).toBe(true);
    expect(isTextMime('application/json')).toBe(true);
    expect(isTextMime('image/png')).toBe(false);
    expect(isTextMime('application/pdf')).toBe(false);
  });

  it('keeps pasted text with its line breaks and drops an empty paste', () => {
    expect(pastedText('f(97,0)\r\nf(48,1)\n\n')).toBe('f(97,0)\nf(48,1)');
    expect(pastedText('   \n\t')).toBeNull();
  });

  it('cuts very long text so the board stays light', () => {
    const trimmed = trimBoardText('a'.repeat(MAX_BOARD_TEXT_CHARS + 50));

    expect(trimmed.length).toBe(MAX_BOARD_TEXT_CHARS + 2);
    expect(trimmed.endsWith('…')).toBe(true);
  });

  it('shows text the participant pasted without fetching it again', async () => {
    const fetcher = vi.fn();
    rememberBoardText('file-1', 'hello');

    await expect(loadBoardText('file-1', '/files/file-1', fetcher)).resolves.toBe('hello');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('fetches text another participant placed, once', async () => {
    const fetcher = vi.fn(async () => new Response('from the room'));

    await expect(loadBoardText('file-2', '/files/file-2', fetcher)).resolves.toBe('from the room');
    await expect(loadBoardText('file-2', '/files/file-2', fetcher)).resolves.toBe('from the room');
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('reports a file that can no longer be fetched', async () => {
    const fetcher = vi.fn(async () => new Response('gone', { status: 404 }));

    await expect(loadBoardText('file-3', '/files/file-3', fetcher)).rejects.toThrow('404');
  });

  it('spreads repeated pastes so they do not hide each other', () => {
    expect(pastePoint(0)).not.toEqual(pastePoint(1));
    expect(pastePoint(6)).toEqual(pastePoint(0));
    expect(pastePoint(5).x).toBeLessThan(1);
  });
});
