import { describe, expect, it } from 'vitest';
import {
  normalizeDisplayName,
  normalizeEmail,
  validateCredentials,
  validateSignUp,
} from './credentials';

describe('validateSignUp', () => {
  it('trims the name, lowercases the email and keeps the password as typed', () => {
    const result = validateSignUp({
      displayName: '  Ada   Lovelace ',
      email: ' Ada@Example.COM ',
      password: ' analytical-1 ',
    });

    expect(result).toEqual({
      ok: true,
      value: {
        displayName: 'Ada Lovelace',
        email: 'ada@example.com',
        password: ' analytical-1 ',
      },
    });
  });

  it('names what is missing, in the order the form asks for it', () => {
    expect(validateSignUp({ displayName: '', email: 'nope', password: 'x' })).toMatchObject({
      reason: 'name-required',
    });
    expect(validateSignUp({ displayName: 'Ada', email: 'nope', password: 'x' })).toMatchObject({
      reason: 'email-invalid',
    });
    expect(
      validateSignUp({ displayName: 'Ada', email: 'ada@example.com', password: 'short' }),
    ).toMatchObject({ reason: 'password-short' });
    expect(
      validateSignUp({ displayName: 'Ada', email: 'ada@example.com', password: 'p'.repeat(201) }),
    ).toMatchObject({ reason: 'password-long' });
  });

  it('survives a body that is not an object at all', () => {
    expect(validateSignUp(undefined)).toMatchObject({ reason: 'name-required' });
    expect(validateSignUp('ada')).toMatchObject({ reason: 'name-required' });
  });
});

describe('validateCredentials', () => {
  it('accepts an email and a password of a plausible length', () => {
    expect(validateCredentials({ email: 'ada@example.com', password: 'analytical-1' })).toEqual({
      ok: true,
      value: { email: 'ada@example.com', password: 'analytical-1' },
    });
  });

  it('teaches nothing about the password rules while signing in', () => {
    expect(validateCredentials({ email: 'ada@example.com', password: 'short' })).toMatchObject({
      reason: 'wrong-credentials',
    });
    expect(validateCredentials({ email: 'ada@', password: 'analytical-1' })).toMatchObject({
      reason: 'email-invalid',
    });
  });
});

describe('normalizers', () => {
  it('caps a display name and collapses its whitespace', () => {
    expect(normalizeDisplayName('  a\n  b  ')).toBe('a b');
    expect(normalizeDisplayName('x'.repeat(80))).toHaveLength(60);
    expect(normalizeEmail(42)).toBe('');
  });
});
