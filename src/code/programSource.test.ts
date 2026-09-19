import { describe, expect, it } from 'vitest';
import { programSource } from './programSource';

describe('programSource', () => {
  it('prefers what is on screen in the editor over an empty shared document', () => {
    expect(programSource('int main(){return 0;}', '')).toBe('int main(){return 0;}');
  });

  it('falls back to the shared document when Monaco has not mounted', () => {
    expect(programSource(undefined, 'print(1)')).toBe('print(1)');
    expect(programSource('   ', 'print(1)')).toBe('print(1)');
  });
});
