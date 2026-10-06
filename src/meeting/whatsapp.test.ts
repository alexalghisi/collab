import { describe, expect, it } from 'vitest';
import { inviteCopy } from './contact';
import { whatsappInviteUrl, whatsappNumber } from './whatsapp';

describe('whatsappNumber', () => {
  it('keeps the digits of a number written the way people write one', () => {
    expect(whatsappNumber('+40 721 123 456')).toBe('40721123456');
    expect(whatsappNumber('+40-721-123-456')).toBe('40721123456');
    expect(whatsappNumber('40721123456')).toBe('40721123456');
  });

  it('refuses a local number, which means nothing to WhatsApp', () => {
    expect(whatsappNumber('0721123456')).toBeNull();
    expect(whatsappNumber('+0721123456')).toBeNull();
  });

  it('refuses anything that is not a phone number', () => {
    expect(whatsappNumber('ada@example.com')).toBeNull();
    expect(whatsappNumber('')).toBeNull();
    expect(whatsappNumber('call me')).toBeNull();
  });
});

describe('whatsappInviteUrl', () => {
  it('opens a chat with the invite already written', () => {
    const message = inviteCopy('alghisi-raluca-481937', 'Ada', 'https://example.com/?room=r');
    const url = new URL(whatsappInviteUrl(message, '+40 721 123 456'));

    expect(url.origin + url.pathname).toBe('https://wa.me/40721123456');
    expect(url.searchParams.get('text')).toBe(message);
  });

  it('opens the contact list when there is nobody to open it with', () => {
    expect(whatsappInviteUrl('join me')).toBe('https://wa.me/?text=join%20me');
    expect(whatsappInviteUrl('join me', '')).toBe('https://wa.me/?text=join%20me');
  });

  it('falls back to the contact list rather than dialling a number WhatsApp cannot use', () => {
    expect(whatsappInviteUrl('join me', '0721123456')).toBe('https://wa.me/?text=join%20me');
  });
});
