import { describe, expect, it } from 'vitest';
import { CODE_LANGUAGES } from './languages';
import { isStarterCode, starterCode, STARTER_CODE } from './starterCode';

describe('starter code', () => {
  it('gives every language something that runs', () => {
    for (const language of CODE_LANGUAGES) {
      expect(starterCode(language).trim()).not.toBe('');
      expect(starterCode(language)).toContain('Hello from Collab');
    }
  });

  it('spells out the parts of C++ and Go nobody wants to type from memory', () => {
    expect(STARTER_CODE.cpp).toContain('#include <iostream>');
    expect(STARTER_CODE.cpp).toContain('int main()');
    expect(STARTER_CODE.cpp).toContain('return 0;');
    expect(STARTER_CODE.go).toContain('package main');
    expect(STARTER_CODE.go).toContain('import "fmt"');
    expect(STARTER_CODE.go).toContain('func main()');
  });

  it('recognises a blank buffer and any untouched starter', () => {
    expect(isStarterCode('')).toBe(true);
    expect(isStarterCode('  \n\n ')).toBe(true);
    for (const language of CODE_LANGUAGES) {
      expect(isStarterCode(starterCode(language))).toBe(true);
    }
  });

  it('treats one changed character as code to keep', () => {
    expect(isStarterCode(`${STARTER_CODE.python}\n`)).toBe(false);
    expect(isStarterCode(STARTER_CODE.cpp.replace('return 0;', 'return 1;'))).toBe(false);
    expect(isStarterCode('print("mine")')).toBe(false);
  });
});
