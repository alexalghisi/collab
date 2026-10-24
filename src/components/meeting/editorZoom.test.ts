import { describe, expect, it } from 'vitest';
import { attachEditorZoom, type ZoomTarget } from './editorZoom';

type Listener = (event: never) => void;

function fakeNode(): ZoomTarget & {
  fire(type: string, event: object): { prevented: boolean };
  count(): number;
} {
  const listeners = new Map<string, Set<Listener>>();
  return {
    addEventListener: (type, listener) => {
      const set = listeners.get(type) ?? new Set();
      set.add(listener);
      listeners.set(type, set);
    },
    removeEventListener: (type, listener) => {
      listeners.get(type)?.delete(listener);
    },
    fire(type, event) {
      const result = { prevented: false };
      const full = { ...event, preventDefault: () => (result.prevented = true) };
      for (const listener of listeners.get(type) ?? []) {
        (listener as (value: unknown) => void)(full);
      }
      return result;
    },
    count: () => [...listeners.values()].reduce((sum, set) => sum + set.size, 0),
  };
}

const fingers = (gap: number) => ({
  touches: [
    { clientX: 0, clientY: 0 },
    { clientX: gap, clientY: 0 },
  ],
});

describe('editor zoom', () => {
  it('follows a pinch through every move, not only the first one', () => {
    const node = fakeNode();
    let size = 16;
    attachEditorZoom(
      node,
      () => size,
      (next) => {
        size = next;
      },
    );

    node.fire('touchstart', fingers(100));
    node.fire('touchmove', fingers(125));
    expect(size).toBe(20);
    const move = node.fire('touchmove', fingers(150));
    expect(size).toBe(24);
    expect(move.prevented).toBe(true);
    node.fire('touchmove', fingers(50));
    expect(size).toBe(12);
  });

  it('ignores one-finger moves and an unfinished pinch', () => {
    const node = fakeNode();
    let size = 16;
    attachEditorZoom(
      node,
      () => size,
      (next) => {
        size = next;
      },
    );

    const scroll = node.fire('touchmove', { touches: [{ clientX: 0, clientY: 0 }] });
    expect(scroll.prevented).toBe(false);
    node.fire('touchstart', fingers(100));
    node.fire('touchend', { touches: [{ clientX: 0, clientY: 0 }] });
    node.fire('touchmove', fingers(200));
    expect(size).toBe(16);
  });

  it('steps with Ctrl+wheel and detaches every listener', () => {
    const node = fakeNode();
    let size = 16;
    const detach = attachEditorZoom(
      node,
      () => size,
      (next) => {
        size = next;
      },
    );

    node.fire('wheel', { ctrlKey: false, deltaY: -1 });
    expect(size).toBe(16);
    node.fire('wheel', { ctrlKey: true, deltaY: -1 });
    node.fire('wheel', { ctrlKey: true, deltaY: -1 });
    expect(size).toBe(18);
    detach();
    expect(node.count()).toBe(0);
  });
});
