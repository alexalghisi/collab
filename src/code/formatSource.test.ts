import { describe, expect, it } from 'vitest';
import { applyFormattedCode, formatSource, languageForFileName } from './formatSource';

describe('formatSource', () => {
  it('indents a jammed javascript function', () => {
    expect(formatSource('javascript', 'function add(a,b){return a+b;}')).toBe(
      ['function add(a, b) {', '  return a + b;', '}'].join('\n'),
    );
  });

  it('does not rearrange text inside strings or comments', () => {
    const source = 'const msg = "{ not code }"; // keep { this';
    expect(formatSource('javascript', source)).toContain('"{ not code }"');
    expect(formatSource('javascript', source)).toContain('// keep { this');
  });

  it('keeps a for-header on one line', () => {
    expect(formatSource('javascript', 'for(let i=0;i<3;i++){ok();}')).toBe(
      ['for (let i = 0; i < 3; i++) {', '  ok();', '}'].join('\n'),
    );
  });

  it('is stable when run twice', () => {
    const once = formatSource('typescript', 'const x=(a:number)=>{return a;};');
    expect(formatSource('typescript', once)).toBe(once);
  });

  it('leaves an empty buffer empty', () => {
    expect(formatSource('javascript', '')).toBe('');
  });

  it('puts cpp braces and includes on their own terms', () => {
    expect(formatSource('cpp', '#include <iostream>\nint main(){int x=1;if(x){return 0;}}')).toBe(
      [
        '#include <iostream>',
        'int main() {',
        '  int x = 1;',
        '  if (x) {',
        '    return 0;',
        '  }',
        '}',
      ].join('\n'),
    );
  });

  it('indents python after a colon and dedents else', () => {
    expect(formatSource('python', 'def f(x):\n  if x:\n    return x\n  else:\n    return 0')).toBe(
      ['def f(x):', '    if x:', '        return x', '    else:', '        return 0'].join('\n'),
    );
  });

  it('formats a compact go function', () => {
    expect(formatSource('go', 'func main(){fmt.Println("hi")}')).toBe(
      ['func main() {', '  fmt.Println("hi")', '}'].join('\n'),
    );
  });

  it('picks a language from the sidecar file name', () => {
    expect(languageForFileName('util.ts')).toBe('typescript');
    expect(languageForFileName('date.in')).toBeNull();
  });

  it('rewrites a sidecar and leaves the main buffer alone', () => {
    const shared = {
      text: { toString: () => 'leave me' },
      replaceText: (next: string) => {
        shared.text = { toString: () => next };
      },
    };
    let files = [{ name: 'helper.js', content: 'function x(){return 1;}' }];
    applyFormattedCode('python', shared, files, files[0], (next) => {
      files = next;
    });
    expect(shared.text.toString()).toBe('leave me');
    expect(files[0].content).toBe(['function x() {', '  return 1;', '}'].join('\n'));
  });
});
