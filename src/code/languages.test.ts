import { describe, expect, it } from 'vitest';
import { languageFromSource, resolveRunLanguage } from './languages';

describe('languageFromSource', () => {
  it('recognises a C++ file from the include and main', () => {
    expect(
      languageFromSource('#include <iostream>\nusing namespace std;\nint main() { return 0; }\n'),
    ).toBe('cpp');
  });

  it('recognises Go from package main', () => {
    expect(languageFromSource('package main\n\nfunc main() {}\n')).toBe('go');
  });

  it('leaves ordinary JavaScript alone', () => {
    expect(languageFromSource('console.log(1)\n')).toBeNull();
  });
});

describe('resolveRunLanguage', () => {
  it('keeps the language the editor is showing', () => {
    expect(resolveRunLanguage('cpp', '#include <iostream>\n')).toBe('cpp');
    expect(resolveRunLanguage('python', 'print(1)\n')).toBe('python');
  });

  it('does not run C++ as JavaScript when the shared document still says javascript', () => {
    expect(
      resolveRunLanguage('javascript', '#include <iostream>\nint main() { return 0; }\n'),
    ).toBe('cpp');
  });
});
