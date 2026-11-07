import { describe, expect, it } from 'vitest';
import { decodeUpdate } from '../code/updates';
import { HANDOFF_PARAM, submitHandoffUrl } from './handoff';

function payloadOf(url: string): unknown {
  const fragment = new URL(url).hash.slice(1);
  const encoded = new URLSearchParams(fragment).get(HANDOFF_PARAM) ?? '';
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  return JSON.parse(new TextDecoder().decode(decodeUpdate(padded)));
}

describe('submitting a Collab solution on collaborare.ro', () => {
  it('opens the problem page with the code, language and submit request in the fragment', () => {
    const code = '#include <iostream>\nint main() { std::cout << "ă"; }\n';
    const url = submitHandoffUrl('coada-la-ghiseu-set-2', 'cpp', code);

    expect(url).not.toBeNull();
    const parsed = new URL(url ?? '');
    expect(parsed.origin + parsed.pathname).toBe(
      'https://collaborare.ro/probleme/coada-la-ghiseu-set-2',
    );
    // Code travels in the fragment, which browsers never send to a server.
    expect(parsed.search).toBe('');
    expect(payloadOf(url ?? '')).toEqual({ v: 1, lang: 'cpp', code, submit: true });
  });

  it('uses URL-safe base64 so nothing in the code can break the link', () => {
    const url = submitHandoffUrl('suma', 'python', 'print(1 + 2)  # ??>>~~\n'.repeat(20)) ?? '';
    const encoded = new URLSearchParams(new URL(url).hash.slice(1)).get(HANDOFF_PARAM) ?? '';
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('only hands off languages collaborare.ro can judge', () => {
    expect(submitHandoffUrl('suma', 'javascript', 'x')).toBeNull();
    expect(submitHandoffUrl('suma', 'go', 'x')).toBeNull();
  });

  it('does not hand off empty code', () => {
    expect(submitHandoffUrl('suma', 'cpp', '   \n')).toBeNull();
  });
});
