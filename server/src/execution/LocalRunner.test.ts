import { describe, expect, it } from 'vitest';
import type { ExecutionChunk } from '../../../src/code/execution';
import { LocalRunner } from './LocalRunner';

describe('LocalRunner', () => {
  it('runs JavaScript with the host Node and returns stdout', async () => {
    const chunks: ExecutionChunk[] = [];
    const result = await new LocalRunner().run(
      { language: 'javascript', code: 'console.log(41+1)', stdin: '', files: [] },
      (chunk) => chunks.push(chunk),
    );

    expect(result.timedOut).toBe(false);
    expect(result.exitCode).toBe(0);
    expect(chunks.map((chunk) => chunk.text).join('')).toContain('42');
  });

  it('gives stdin to the program', async () => {
    const chunks: ExecutionChunk[] = [];
    await new LocalRunner().run(
      {
        language: 'javascript',
        code: 'let s=""; process.stdin.on("data",d=>s+=d); process.stdin.on("end",()=>console.log(s.trim()));',
        stdin: 'hello\n',
        files: [],
      },
      (chunk) => chunks.push(chunk),
    );

    expect(chunks.map((chunk) => chunk.text).join('')).toContain('hello');
  });

  // Compiling C++ can outrun the default timeout under a loaded, parallel suite.
  it('compiles and runs C++, reading date.in and writing date.out', async () => {
    const chunks: ExecutionChunk[] = [];
    const result = await new LocalRunner().run(
      {
        language: 'cpp',
        code: [
          '#include <iostream>',
          '#include <fstream>',
          'int main(){',
          '  std::ifstream in("date.in"); int a,b; in>>a>>b;',
          '  std::ofstream out("date.out"); out<<a+b<<"\\n";',
          '  std::cout<<"sum="<<a+b<<"\\n";',
          '  return 0;',
          '}',
        ].join('\n'),
        stdin: '',
        files: [{ name: 'date.in', content: '20 22' }],
      },
      (chunk) => chunks.push(chunk),
    );

    expect(result.timedOut).toBe(false);
    expect(result.exitCode).toBe(0);
    expect(chunks.map((chunk) => chunk.text).join('')).toContain('sum=42');
    expect(result.files).toEqual([{ name: 'date.out', content: '42\n' }]);
  }, 20_000);

  it('returns files the program wrote next to the source', async () => {
    const result = await new LocalRunner().run(
      {
        language: 'javascript',
        code: [
          "const fs = require('fs');",
          "const input = fs.readFileSync('date.in','utf8');",
          "fs.writeFileSync('date.out', String(Number(input)+1));",
        ].join('\n'),
        stdin: '',
        files: [{ name: 'date.in', content: '41' }],
      },
      () => {},
    );

    expect(result.files).toEqual([{ name: 'date.out', content: '42' }]);
  });
});
