import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ExecutionRequest } from '../code/execution';
import type { HostedRunOutcome } from '../code/hostedRun';
import { compileErrorSummary, resetExampleBatching, runProblemExamples } from './examples';
import {
  BATCH_MAX_INPUT_BYTES,
  batchBlamesProgram,
  batchWasRefused,
  buildCppExampleBatch,
  canBatchExamples,
  newBatchToken,
  parseExampleBatch,
} from './examplesBatch';

const TOKEN = 'tok123abc456';
const mark = (index: number, state: string, detail: number): string =>
  `<<collab:${TOKEN}:${index}:${state}:${detail}>>\n`;

const POWER_OF_TWO = `#include <iostream>
using namespace std;
int putere2(long long n) { return n > 0 && (n & (n - 1)) == 0; }
int main() {
  ios::sync_with_stdio(false);
  int q;
  cin >> q;
  while (q--) {
    long long x;
    cin >> x;
    cout << putere2(x) << "\\n";
  }
}
`;
const POWER_EXAMPLES = [
  { input: '1\n1\n', output: '1\n' },
  { input: '2\n1 2\n', output: '1\n1\n' },
  { input: '4\n1 2 7 10\n', output: '1\n1\n0\n0\n' },
];

beforeEach(() => {
  resetExampleBatching();
});

describe('batch tokens and limits', () => {
  it('makes a token that is safe inside a C++ identifier', () => {
    expect(newBatchToken()).toMatch(/^[a-z0-9]{12}$/);
    expect(newBatchToken(() => 0.999)).toBe('zzzzzzzzzzzz');
  });

  it('batches only several small inputs', () => {
    expect(canBatchExamples(['1\n', '2\n'])).toBe(true);
    expect(canBatchExamples(['1\n'])).toBe(false);
    expect(canBatchExamples(['1\n', 'x'.repeat(BATCH_MAX_INPUT_BYTES + 1)])).toBe(false);
    expect(canBatchExamples(Array.from({ length: 13 }, () => '1\n'))).toBe(false);
  });
});

describe('reading a batch back', () => {
  it('cuts the output into one outcome per example', () => {
    const stdout = `1\n${mark(0, 'exit', 0)}no newline${mark(1, 'exit', 3)}${mark(2, 'signal', 11)}`;

    expect(parseExampleBatch(stdout, TOKEN, 3)).toEqual([
      { stdout: '1\n', stderr: '', exitCode: 0, timedOut: false, error: null, compileError: null },
      {
        stdout: 'no newline',
        stderr: '',
        exitCode: 3,
        timedOut: false,
        error: null,
        compileError: null,
      },
      { stdout: '', stderr: '', exitCode: null, timedOut: false, error: null, compileError: null },
    ]);
  });

  it('counts an example stopped by the alarm or killed by the sandbox as timed out', () => {
    const slots = parseExampleBatch(`${mark(0, 'signal', 14)}${mark(1, 'signal', 9)}`, TOKEN, 2);

    expect(slots.map((slot) => slot?.timedOut)).toEqual([true, true]);
  });

  it('leaves examples the batch never reached to be run on their own', () => {
    const slots = parseExampleBatch(`1\n${mark(0, 'exit', 0)}half an answ`, TOKEN, 3);

    expect(slots.map((slot) => slot?.stdout ?? null)).toEqual(['1\n', null, null]);
  });

  it('trusts nothing from a sandbox that refused to fork', () => {
    const stdout = `1\n${mark(0, 'exit', 0)}${mark(1, 'unsupported', 11)}`;

    expect(parseExampleBatch(stdout, TOKEN, 2)).toEqual([null, null]);
    expect(batchWasRefused(stdout, TOKEN)).toBe(true);
    expect(batchWasRefused(`1\n${mark(0, 'exit', 0)}`, TOKEN)).toBe(false);
  });

  it('ignores markers that carry another run’s token', () => {
    const forged = '<<collab:someoneelse1:0:exit:0>>\n';

    expect(parseExampleBatch(`${forged}7\n${mark(0, 'exit', 0)}`, TOKEN, 1)[0]?.stdout).toBe(
      `${forged}7\n`,
    );
  });
});

describe('whose fault a failed batch build is', () => {
  it('blames the program when its own line is the first error', () => {
    expect(
      batchBlamesProgram(
        "main.cpp: In function 'int main()':\nmain.cpp:2:33: error: 'cout' was not declared in this scope",
      ),
    ).toBe(true);
  });

  it('does not blame the program when the runner or a macro is involved', () => {
    expect(
      batchBlamesProgram(
        "/usr/include/unistd.h:372:5: error: 'ssize_t read(int, void*, size_t)' redeclared as different kind of entity\nmain.cpp:3:5: note: previous declaration 'int read'",
      ),
    ).toBe(false);
    expect(
      batchBlamesProgram(
        "main.cpp:3:18: error: 'unsigned' specified with 'char'\n/usr/include/x.h:1:1: note: in expansion of macro 'unsigned'",
      ),
    ).toBe(false);
    expect(
      batchBlamesProgram(
        "main.cpp:2:1: error: expected '}'\ncollab-examples.h:70:1: error: expected '}' at end of input",
      ),
    ).toBe(false);
    expect(batchBlamesProgram("ld: undefined reference to `main'")).toBe(false);
  });

  it('shortens compiler output to the line a student needs', () => {
    expect(
      compileErrorSummary(
        "prog.cc: In function 'int main()':\nprog.cc:7:3: error: 'cout' was not declared in this scope\n",
      ),
    ).toBe("line 7: 'cout' was not declared in this scope");
    expect(compileErrorSummary("/usr/bin/ld: (.text+0x1b): undefined reference to `main'\n")).toBe(
      "/usr/bin/ld: (.text+0x1b): undefined reference to `main'",
    );
  });
});

const hasCompiler = spawnSync('g++', ['--version']).status === 0;

/** Stands in for the hosted compiler: builds and runs on this machine, answers in its shape. */
function localCompiler(requests: ExecutionRequest[]) {
  return async (request: ExecutionRequest): Promise<HostedRunOutcome> => {
    requests.push(request);
    const dir = mkdtempSync(join(tmpdir(), 'collab-batch-'));
    writeFileSync(join(dir, 'prog.cc'), request.code);
    const build = spawnSync('g++', ['prog.cc', '-o', 'prog'], { cwd: dir, encoding: 'utf8' });
    const base = { stderr: build.stderr, timedOut: false, error: null };
    if (build.status !== 0) {
      return { ...base, stdout: '', exitCode: 1, compileError: build.stderr };
    }
    const run = spawnSync(join(dir, 'prog'), [], {
      cwd: dir,
      encoding: 'utf8',
      input: request.stdin,
    });
    return { ...base, stdout: run.stdout, exitCode: run.status, compileError: null };
  };
}

describe.skipIf(!hasCompiler)(
  'one compile for every example (real g++)',
  { timeout: 120_000 },
  () => {
    it('gets every verdict from a single request', async () => {
      const requests: ExecutionRequest[] = [];

      const verdicts = await runProblemExamples({
        language: 'cpp',
        code: POWER_OF_TWO,
        examples: POWER_EXAMPLES,
        run: localCompiler(requests),
      });

      expect(requests).toHaveLength(1);
      expect(verdicts.map((item) => item.passed)).toEqual([true, true, true]);
      expect(verdicts.map((item) => item.actual)).toEqual(['1\n', '1\n1\n', '1\n1\n0\n0\n']);
    });

    it('keeps each example apart: wrong answers, exit codes, crashes and endless loops', async () => {
      const requests: ExecutionRequest[] = [];
      const code = `#include <iostream>
int main() {
  int q;
  std::cin >> q;
  std::cout << "q=" << q << std::endl;
  if (q == 1) return 3;
  if (q == 2) { int* nowhere = 0; *nowhere = 1; }
  if (q == 4) for (;;) {}
}
`;
      const run = localCompiler(requests);
      const outcome = await run(buildCppExampleBatch(code, ['1\n', '2\n', '4\n', '5\n'], TOKEN, 1));

      const slots = parseExampleBatch(outcome.stdout, TOKEN, 4);

      expect(slots.map((slot) => slot?.stdout)).toEqual(['q=1\n', 'q=2\n', 'q=4\n', 'q=5\n']);
      expect(slots.map((slot) => slot?.exitCode)).toEqual([3, null, null, 0]);
      expect(slots.map((slot) => slot?.timedOut)).toEqual([false, false, true, false]);
    });

    it('runs programs that redefine int, read with scanf, or read to the end of input', async () => {
      const sum = [
        { input: '2\n3 4\n', output: '7' },
        { input: '3\n1 1 1\n', output: '3' },
      ];
      const programs = [
        `#include <bits/stdc++.h>
#define int long long
#define pb push_back
#define x first
using namespace std;
signed main() { int q, total = 0; cin >> q; while (q--) { int v; cin >> v; total += v; } cout << total; }`,
        `#include <cstdio>
int main() { int q; long long total = 0; scanf("%d", &q); while (q--) { long long v; scanf("%lld", &v); total += v; } printf("%lld", total); return 0; } // no newline after this`,
        `#include <iostream>
int main() { long long q, v, total = 0; std::cin >> q; while (std::cin >> v) total += v; std::cout << total; }`,
      ];

      for (const code of programs) {
        const requests: ExecutionRequest[] = [];
        const verdicts = await runProblemExamples({
          language: 'cpp',
          code,
          examples: sum,
          run: localCompiler(requests),
        });
        expect(requests).toHaveLength(1);
        expect(verdicts.map((item) => item.passed)).toEqual([true, true]);
      }
    });

    it('passes input bytes through untouched, whatever they contain', async () => {
      const tricky = 'ș"\\n\\ ?? */ <<collab>> țară\n';
      const echo = `#include <iostream>
#include <string>
int main() { std::string line; while (std::getline(std::cin, line)) std::cout << line << "\\n"; }`;

      const verdicts = await runProblemExamples({
        language: 'cpp',
        code: echo,
        examples: [
          { input: tricky, output: tricky },
          { input: '', output: '' },
        ],
        run: localCompiler([]),
      });

      expect(verdicts.map((item) => item.passed)).toEqual([true, true]);
      expect(verdicts[0]?.actual).toBe(tricky);
    });

    it('reports a program that does not compile once, for every example', async () => {
      const requests: ExecutionRequest[] = [];

      const verdicts = await runProblemExamples({
        language: 'cpp',
        code: '#include <iostream>\nint main() {\n  int q;\n  std::cin >> q;\n  cout << q;\n}\n',
        examples: POWER_EXAMPLES,
        run: localCompiler(requests),
      });

      expect(requests).toHaveLength(1);
      expect(verdicts.map((item) => item.passed)).toEqual([false, false, false]);
      expect(verdicts[0]?.error).toMatch(/^Does not compile \(line 5: .*cout/);
    });

    it('still judges a program the runner cannot be appended to', async () => {
      const requests: ExecutionRequest[] = [];
      // A global named like a system call collides with the runner's headers, not with the program.
      const code = `#include <iostream>
int read, link;
int main() { int q; std::cin >> q; read = q; link = 1; std::cout << read + link; }
`;

      const verdicts = await runProblemExamples({
        language: 'cpp',
        code,
        examples: [
          { input: '1\n', output: '2' },
          { input: '5\n', output: '6' },
          { input: '7\n', output: '0' },
        ],
        run: localCompiler(requests),
      });

      expect(verdicts.map((item) => item.passed)).toEqual([true, true, false]);
      expect(verdicts.map((item) => item.error)).toEqual([null, null, null]);
      // The batch, then the program on its own for each example.
      expect(requests).toHaveLength(4);
    });

    it('shows the real error of a program with an unclosed brace or no main', async () => {
      for (const code of [
        '#include <iostream>\nint main() {\n  int q;\n  std::cin >> q;\n',
        '#include <iostream>\n// nothing written yet\n',
      ]) {
        const requests: ExecutionRequest[] = [];
        const verdicts = await runProblemExamples({
          language: 'cpp',
          code,
          examples: POWER_EXAMPLES,
          run: localCompiler(requests),
        });

        expect(requests.length).toBeLessThanOrEqual(2);
        expect(verdicts.map((item) => item.passed)).toEqual([false, false, false]);
        expect(verdicts.every((item) => item.error?.startsWith('Does not compile ('))).toBe(true);
        expect(verdicts[0]?.error).not.toContain('collab-examples');
      }
    });
  },
);

describe('running examples without one shared compile', () => {
  const outcome = (stdout: string): HostedRunOutcome => ({
    stdout,
    stderr: '',
    exitCode: 0,
    timedOut: false,
    error: null,
    compileError: null,
  });

  it('runs the examples of other languages side by side, not one after another', async () => {
    let running = 0;
    let most = 0;

    const verdicts = await runProblemExamples({
      language: 'python',
      code: 'print(input())',
      examples: ['1', '2', '3', '4', '5', '6'].map((value) => ({ input: value, output: value })),
      run: async (request) => {
        running += 1;
        most = Math.max(most, running);
        await new Promise((resolve) => setTimeout(resolve, 5));
        running -= 1;
        return outcome(request.stdin);
      },
    });

    expect(most).toBe(4);
    expect(verdicts.map((item) => item.index)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(verdicts.every((item) => item.passed)).toBe(true);
  });

  it('does not ask per example when the compiler could not be reached for the batch', async () => {
    const requests: ExecutionRequest[] = [];

    const verdicts = await runProblemExamples({
      language: 'cpp',
      code: POWER_OF_TWO,
      examples: POWER_EXAMPLES,
      run: async (request) => {
        requests.push(request);
        return { ...outcome(''), exitCode: null, error: 'the cloud sandbox is busy' };
      },
    });

    expect(requests).toHaveLength(1);
    expect(verdicts.map((item) => item.error)).toEqual(Array(3).fill('the cloud sandbox is busy'));
  });

  it('stops batching for the session once the sandbox has refused one', async () => {
    const requests: ExecutionRequest[] = [];
    const run = async (request: ExecutionRequest): Promise<HostedRunOutcome> => {
      requests.push(request);
      return request.stdin === ''
        ? outcome(mark(0, 'unsupported', 11))
        : outcome(request.stdin === '1\n1\n' ? '1\n' : 'wrong\n');
    };
    const options = { language: 'cpp' as const, code: POWER_OF_TWO, examples: POWER_EXAMPLES, run };

    const first = await runProblemExamples({ ...options, token: TOKEN });
    const second = await runProblemExamples({ ...options, token: TOKEN });

    expect(first.map((item) => item.passed)).toEqual([true, false, false]);
    expect(second).toEqual(first);
    // Batch + three alone the first time; only the three alone afterwards.
    expect(requests).toHaveLength(7);
  });
});
