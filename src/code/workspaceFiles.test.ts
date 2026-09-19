import { describe, expect, it } from 'vitest';
import {
  MAX_FILE_BYTES,
  MAX_WORKSPACE_FILES,
  isWorkspaceFileName,
  cppSidecarsIfNeeded,
  mergeWorkspaceFiles,
  normalizeWorkspaceFiles,
  withCppSidecars,
} from './workspaceFiles';

describe('workspace files', () => {
  it('keeps a contest input file', () => {
    expect(normalizeWorkspaceFiles([{ name: 'date.in', content: '3\n1 2 3\n' }])).toEqual([
      { name: 'date.in', content: '3\n1 2 3\n' },
    ]);
  });

  it('rejects names that would collide with the program the sandbox runs', () => {
    expect(isWorkspaceFileName('date.in')).toBe(true);
    expect(isWorkspaceFileName('date.out')).toBe(true);
    expect(isWorkspaceFileName('main.cpp')).toBe(false);
    expect(isWorkspaceFileName('../secret')).toBe(false);
    expect(isWorkspaceFileName('a/b')).toBe(false);
    expect(normalizeWorkspaceFiles([{ name: 'main.cpp', content: 'stolen' }])).toEqual([]);
  });

  it('drops duplicates and empty names rather than sending them to the sandbox', () => {
    expect(
      normalizeWorkspaceFiles([
        { name: 'date.in', content: 'first' },
        { name: 'date.in', content: 'second' },
        { name: '', content: 'nope' },
        { content: 'missing' },
      ]),
    ).toEqual([{ name: 'date.in', content: 'first' }]);
  });

  it('caps how many files travel with a run', () => {
    const files = Array.from({ length: MAX_WORKSPACE_FILES + 5 }, (_, index) => ({
      name: `f${index}.in`,
      content: 'x',
    }));

    expect(normalizeWorkspaceFiles(files)).toHaveLength(MAX_WORKSPACE_FILES);
  });

  it('truncates a huge file instead of rejecting the rest of the run', () => {
    const [file] = normalizeWorkspaceFiles([
      { name: 'date.in', content: 'x'.repeat(MAX_FILE_BYTES + 50) },
    ]);

    expect(file?.content.length).toBe(MAX_FILE_BYTES);
  });

  it('lets a later generated file replace the same name', () => {
    expect(
      mergeWorkspaceFiles(
        [{ name: 'date.in', content: '1' }],
        [
          { name: 'date.in', content: '1' },
          { name: 'date.out', content: '2' },
        ],
      ),
    ).toEqual([
      { name: 'date.in', content: '1' },
      { name: 'date.out', content: '2' },
    ]);
  });

  it('opens date.in and date.out next to a C++ program so ifstream can find them', () => {
    expect(withCppSidecars([])).toEqual([
      { name: 'date.in', content: '' },
      { name: 'date.out', content: '' },
    ]);
    expect(withCppSidecars([{ name: 'date.in', content: '3\n' }])).toEqual([
      { name: 'date.in', content: '3\n' },
      { name: 'date.out', content: '' },
    ]);
    expect(cppSidecarsIfNeeded('python', [])).toBeNull();
    expect(cppSidecarsIfNeeded('cpp', withCppSidecars([]))).toBeNull();
  });
});
