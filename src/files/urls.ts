import { SIGNALING_URL } from '../signaling/config';

/** Turns a server path such as `/files/abc` into a URL the browser can fetch. */
export function attachmentHref(url: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  return `${SIGNALING_URL}${url.startsWith('/') ? url : `/${url}`}`;
}
