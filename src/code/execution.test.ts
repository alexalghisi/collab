import { describe, expect, it } from 'vitest';
import { MAX_CODE_BYTES, MAX_STDIN_BYTES, validateExecutionRequest } from './execution';

describe('validateExecutionRequest', () => {
  it('accepts a supported language and normalises missing input', () => {
    const result = validateExecutionRequest({ language: 'python', code: 'print(1)' });

    expect(result).toEqual({
      ok: true,
      request: { language: 'python', code: 'print(1)', stdin: '', files: [] },
    });
  });

  it('accepts C++ as a runnable language', () => {
    expect(
      validateExecutionRequest({
        language: 'cpp',
        code: '#include <iostream>\nint main() { std::cout << 1; }\n',
      }).ok,
    ).toBe(true);
  });

  it('rejects a language the sandbox has no image for', () => {
    expect(validateExecutionRequest({ language: 'ruby', code: 'puts 1' })).toEqual({
      ok: false,
      reason: 'unsupported-language',
    });
  });

  it('rejects a request with nothing to run', () => {
    expect(validateExecutionRequest({ language: 'go', code: '   \n\t' })).toEqual({
      ok: false,
      reason: 'empty-code',
    });
  });

  it('measures the caps in bytes rather than characters', () => {
    // Half the character count of the cap, but past it once encoded.
    const multibyte = '🙂'.repeat(MAX_CODE_BYTES / 4 + 1);

    expect(validateExecutionRequest({ language: 'javascript', code: multibyte })).toEqual({
      ok: false,
      reason: 'code-too-large',
    });
  });

  it('rejects oversized input', () => {
    expect(
      validateExecutionRequest({
        language: 'javascript',
        code: 'read()',
        stdin: 'x'.repeat(MAX_STDIN_BYTES + 1),
      }),
    ).toEqual({ ok: false, reason: 'stdin-too-large' });
  });

  it('rejects a payload that is not a request at all', () => {
    for (const payload of [undefined, null, 'run this', { code: 'print(1)' }]) {
      expect(validateExecutionRequest(payload).ok).toBe(false);
    }
  });

  it('sends named files along with the program', () => {
    const result = validateExecutionRequest({
      language: 'cpp',
      code: 'int main() {}',
      files: [{ name: 'date.in', content: '7\n' }],
    });

    expect(result).toEqual({
      ok: true,
      request: {
        language: 'cpp',
        code: 'int main() {}',
        stdin: '',
        files: [{ name: 'date.in', content: '7\n' }],
      },
    });
  });
});
