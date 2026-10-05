import { parseContact } from './contact';

const CLICK_TO_CHAT = 'https://wa.me/';

/**
 * A number WhatsApp can look up: digits only, country code included. It will
 * not take the `+`, the spaces or the dashes people write numbers with, and a
 * number that begins with a trunk zero means nothing outside its own country.
 */
export function whatsappNumber(phone: string): string | null {
  const parsed = parseContact(phone);
  if (parsed?.kind !== 'phone' || parsed.value.startsWith('+0')) {
    return null;
  }
  return parsed.value.replace(/\D/g, '');
}

/**
 * Opens a WhatsApp chat with the invite already typed out; all the host has to
 * do is press send. Without a number it opens WhatsApp's own contact list, so
 * the person can be picked by name instead of looked up by digits.
 *
 * This is the click-to-chat link, not the Business API: nothing to configure,
 * nothing to pay for, and it works the same on a phone and in the browser.
 */
export function whatsappInviteUrl(message: string, phone?: string | null): string {
  const digits = phone ? (whatsappNumber(phone) ?? '') : '';
  return `${CLICK_TO_CHAT}${digits}?text=${encodeURIComponent(message)}`;
}

export const WHATSAPP_NEEDS_COUNTRY_CODE = 'WhatsApp needs the country code, like +40 721 123 456.';
