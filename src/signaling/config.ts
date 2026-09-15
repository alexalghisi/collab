const DEFAULT_PORT = '4000';
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
/** Static hosts cannot run the signaling process, so they must not same-origin. */
const STATIC_HOST_SUFFIXES = [
  'github.io',
  'gitlab.io',
  'netlify.app',
  'vercel.app',
  'pages.dev',
];

function isStaticHost(hostname: string): boolean {
  return STATIC_HOST_SUFFIXES.some(
    (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`),
  );
}

/** Enough of `window.location` to pick a host the page can actually reach. */
export interface PageLocation {
  readonly protocol: string;
  readonly hostname: string;
  readonly port: string;
  readonly origin: string;
}

/**
 * Picks the Socket.IO URL the client should dial.
 *
 * An explicit `EXPO_PUBLIC_SIGNALING_URL` always wins. Otherwise the page's
 * own host is used so a phone on the LAN, or a preview whose hostname is the
 * machine running the server, does not keep aiming at *its* localhost. Loopback
 * previews (Metro on 8081, a static export on 4173) still talk to :4000 on
 * the same machine. Opening the app from the signaling process itself (port
 * 4000) stays on that origin, so a single-port tunnel carries both the page
 * and the socket.
 */
export function resolveSignalingUrl(
  configured: string | undefined,
  location?: PageLocation,
): string {
  const explicit = configured?.trim();
  if (explicit) {
    return stripTrailingSlash(explicit);
  }
  if (!location?.hostname) {
    return `http://localhost:${DEFAULT_PORT}`;
  }
  if (location.port === DEFAULT_PORT) {
    return stripTrailingSlash(location.origin);
  }
  if (LOOPBACK.has(location.hostname)) {
    return `http://localhost:${DEFAULT_PORT}`;
  }
  if (location.port) {
    const scheme = location.protocol === 'https:' ? 'https' : 'http';
    return `${scheme}://${location.hostname}:${DEFAULT_PORT}`;
  }
  // github.io and other static hosts have no signaling process. A tunnel or
  // custom domain that served this page is the signaling origin itself.
  if (isStaticHost(location.hostname)) {
    return `http://localhost:${DEFAULT_PORT}`;
  }
  return stripTrailingSlash(location.origin);
}

function stripTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

const pageLocation: PageLocation | undefined =
  typeof document !== 'undefined' && typeof window !== 'undefined' ? window.location : undefined;

/**
 * Falls back to the local dev server. A hosted build (GitHub Pages, desktop
 * shell) must set EXPO_PUBLIC_SIGNALING_URL at build time unless Firebase is
 * configured, otherwise a visitor on a public site still aims at their own
 * machine and the error names that URL.
 */
export const SIGNALING_URL = resolveSignalingUrl(
  process.env.EXPO_PUBLIC_SIGNALING_URL,
  pageLocation,
);
