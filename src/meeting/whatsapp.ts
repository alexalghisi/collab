import { parseContact } from './contact';

const CLICK_TO_CHAT = 'https://wa.me/';

export function whatsappNumber(phone: string): string | null {
  const parsed = parseContact(phone);
  if (parsed?.kind !== 'phone' || parsed.value.startsWith('+0')) {
    return null;
  }
  return parsed.value.replace(/\D/g, '');
}

export function whatsappInviteUrl(message: string, phone?: string | null): string {
  const digits = phone ? (whatsappNumber(phone) ?? '') : '';
  return `${CLICK_TO_CHAT}${digits}?text=${encodeURIComponent(message)}`;
}

export const WHATSAPP_NEEDS_COUNTRY_CODE = 'WhatsApp needs the country code, like +40 721 123 456.';
