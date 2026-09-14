/**
 * The rules for an account, shared by the form that collects one and the
 * server that stores it, so the client can say what is wrong before asking
 * and the server never trusts that it did.
 */
export const MIN_PASSWORD_LENGTH = 8;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

export const looksLikeEmail = (email: string): boolean => EMAIL_PATTERN.test(normalizeEmail(email));
