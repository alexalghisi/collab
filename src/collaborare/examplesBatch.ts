import type { ExecutionRequest } from '../code/execution';
import type { HostedRunOutcome } from '../code/hostedRun';

/**
 * "Run on examples" used to compile the same C++ once per example. The hosted
 * compiler spends nearly all of its time compiling, so a problem with three
 * examples waited three times and had three chances to hit a busy moment.
 *
 * A batch compiles once: a small runner is appended to the program and, before
 * `main` starts, forks one child per example with that example's input on
 * stdin. Each child then falls through to the program's own untouched `main`.
 * The runner prints a marker after every child, so the single output can be cut
 * back into one result per example.
 */

/** The names diagnostics carry, so the program's own errors can be told from the runner's. */
export const BATCH_PROGRAM_NAME = 'main.cpp';
export const BATCH_SOURCE_NAME = 'collab-examples.h';

/** Wall-clock seconds one example may take before it counts as timed out. */
export const BATCH_EXAMPLE_SECONDS = 5;

const SIGALRM = 14;
const SIGKILL = 9;
const SIGXCPU = 24;

/** Inputs are handed to each child through a pipe, which only holds so much without a reader. */
export const BATCH_MAX_INPUT_BYTES = 16_000;
export const BATCH_MAX_EXAMPLES = 12;

/** Random per run, so program output cannot be mistaken for a marker. */
export function newBatchToken(random: () => number = Math.random): string {
  let token = '';
  while (token.length < 12) {
    token += Math.floor(random() * 36).toString(36);
  }
  return token;
}

function inputBytes(input: string): Uint8Array {
  return new TextEncoder().encode(input);
}

/** Whether these inputs are few and small enough to share one compile. */
export function canBatchExamples(inputs: readonly string[]): boolean {
  return (
    inputs.length > 1 &&
    inputs.length <= BATCH_MAX_EXAMPLES &&
    inputs.every((input) => inputBytes(input).length <= BATCH_MAX_INPUT_BYTES)
  );
}

function runnerSource(token: string, inputs: readonly string[], seconds: number): string {
  const bytes = inputs.map(inputBytes);
  // Bytes, not string literals: nothing in an input can then need escaping.
  const data = bytes
    .map(
      (input, index) =>
        `static const unsigned char input_${index}[] = {${[...input, 0].join(',')}};`,
    )
    .join('\n');
  return `
#line 1 "${BATCH_SOURCE_NAME}"
#pragma push_macro("int")
#undef int
#include <cerrno>
#include <cstdio>
#include <fcntl.h>
#include <signal.h>
#include <sys/wait.h>
#include <unistd.h>
namespace collab_examples_${token} {
${data}
static const unsigned char* const inputs[] = {${bytes.map((_, index) => `input_${index}`).join(', ')}};
static const int sizes[] = {${bytes.map((input) => input.length).join(', ')}};
struct Runner {
  static bool send(int target, const void* data, int length) {
    const char* bytes = (const char*)data;
    for (int sent = 0; sent < length;) {
      ssize_t wrote = ::write(target, bytes + sent, (size_t)(length - sent));
      if (wrote <= 0) return false;
      sent += (int)wrote;
    }
    return true;
  }
  static void mark(int index, const char* state, int detail) {
    char line[96];
    int length = ::snprintf(line, sizeof line, "<<collab:${token}:%d:%s:%d>>\\n", index, state, detail);
    send(1, line, length);
  }
  static void refuse(int index) {
    mark(index, "unsupported", errno);
    ::_exit(0);
  }
  Runner() {
    for (int index = 0; index < ${inputs.length}; ++index) {
      int feed[2];
      if (::pipe(feed) != 0) refuse(index);
      // Never block on a pipe nobody reads yet: a short write means "run this one alone".
      ::fcntl(feed[1], F_SETFL, O_NONBLOCK);
      if (!send(feed[1], inputs[index], sizes[index])) refuse(index);
      ::close(feed[1]);
      ::fflush(NULL);
      pid_t child = ::fork();
      if (child < 0) refuse(index);
      if (child == 0) {
        if (::dup2(feed[0], 0) < 0) refuse(index);
        ::close(feed[0]);
        ::alarm(${seconds});
        return;
      }
      ::close(feed[0]);
      int status = 0;
      while (::waitpid(child, &status, 0) < 0 && errno == EINTR) {
      }
      if (WIFEXITED(status)) {
        mark(index, "exit", WEXITSTATUS(status));
      } else if (WIFSIGNALED(status)) {
        mark(index, "signal", WTERMSIG(status));
      } else {
        refuse(index);
      }
    }
    ::_exit(0);
  }
};
static Runner runner;
}
#pragma pop_macro("int")
`;
}

/** One request that compiles `code` once and runs it on every input. */
export function buildCppExampleBatch(
  code: string,
  inputs: readonly string[],
  token: string,
  seconds: number = BATCH_EXAMPLE_SECONDS,
): ExecutionRequest {
  return {
    language: 'cpp',
    code: `#line 1 "${BATCH_PROGRAM_NAME}"\n${code}\n${runnerSource(token, inputs, seconds)}`,
    stdin: '',
    files: [],
  };
}

/** True when the sandbox would not let the runner work at all (no pipe, no fork). */
export function batchWasRefused(stdout: string, token: string): boolean {
  return new RegExp(`<<collab:${token}:\\d+:unsupported:`).test(stdout);
}

/**
 * Cuts a batch's output back into one outcome per example. A slot is null when
 * the batch cannot vouch for that example (the sandbox refused to fork, the
 * output was cut short, …); those are then run on their own.
 */
export function parseExampleBatch(
  stdout: string,
  token: string,
  count: number,
): (HostedRunOutcome | null)[] {
  const slots: (HostedRunOutcome | null)[] = Array.from({ length: count }, () => null);
  const marker = new RegExp(
    `<<collab:${token}:(\\d+):(exit|signal|unsupported):(-?\\d+)>>\\n`,
    'g',
  );
  let from = 0;
  let expected = 0;
  for (let match = marker.exec(stdout); match !== null; match = marker.exec(stdout)) {
    const index = Number(match[1]);
    const detail = Number(match[3]);
    if (match[2] === 'unsupported' || index !== expected || index >= count) {
      return Array.from({ length: count }, () => null);
    }
    const exited = match[2] === 'exit';
    slots[index] = {
      stdout: stdout.slice(from, match.index),
      stderr: '',
      exitCode: exited ? detail : null,
      timedOut: !exited && (detail === SIGALRM || detail === SIGKILL || detail === SIGXCPU),
      error: null,
      compileError: null,
    };
    from = match.index + match[0].length;
    expected += 1;
  }
  return slots;
}

/**
 * True when a failed batch build is certainly the program's own fault: the
 * compiler's first error sits in the program, above the runner, and nothing
 * points at the runner or at a macro (a `#define` can break the runner's headers
 * and still be reported on the program's line). Anything less clear is settled
 * by building the program on its own.
 */
export function batchBlamesProgram(diagnostics: string): boolean {
  const first = /^(.+?):\d+:\d+: (?:fatal )?error: /m.exec(diagnostics);
  return (
    first?.[1] === BATCH_PROGRAM_NAME &&
    !diagnostics.includes(BATCH_SOURCE_NAME) &&
    !diagnostics.includes('in expansion of macro')
  );
}
