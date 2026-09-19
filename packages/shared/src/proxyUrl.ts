/**
 * Validation and redaction for the outbound proxy URL.
 *
 * The URL is operator-supplied through the dashboard and usually carries
 * credentials, so it is validated before being stored and redacted before being
 * shown or logged.
 */

/** Schemes yt-dlp's --proxy understands. Anything else is rejected. */
const ALLOWED_SCHEMES = ['http:', 'https:', 'socks4:', 'socks4a:', 'socks5:', 'socks5h:'];

export class ProxyUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProxyUrlError';
  }
}

/**
 * Validates a proxy URL and returns it in canonical form.
 *
 * Throws {@link ProxyUrlError} with a message safe to show the operator - it
 * describes the problem without echoing the value, which may hold a password.
 */
export function normalizeProxyUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new ProxyUrlError('Proxy URL is empty');
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new ProxyUrlError('Proxy URL is not a valid URL. Expected scheme://host:port');
  }

  if (!ALLOWED_SCHEMES.includes(url.protocol)) {
    throw new ProxyUrlError(
      `Unsupported proxy scheme. Use one of: ${ALLOWED_SCHEMES.map((s) => s.slice(0, -1)).join(', ')}`
    );
  }

  if (!url.hostname) {
    throw new ProxyUrlError('Proxy URL has no host');
  }

  // A proxy is an origin. yt-dlp ignores anything after it, so a pasted
  // "…:8080/setup" would look accepted while silently dropping the path.
  if ((url.pathname !== '' && url.pathname !== '/') || url.search || url.hash) {
    throw new ProxyUrlError('Proxy URL must not contain a path, query or fragment');
  }

  // URL lowercases the host only for special schemes, so socks5://HOST keeps
  // its case unless we do it here.
  const host = url.hostname.toLowerCase();
  const port = url.port ? `:${url.port}` : '';
  const credentials = buildCredentials(url.username, url.password);

  return `${url.protocol}//${credentials}${host}${port}`;
}

/**
 * Redacts the password from a proxy URL for display and logging.
 *
 * Never returns the password: a URL that will not parse is withheld entirely
 * rather than echoed back, since the unparseable text may still contain one.
 */
export function maskProxyUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return '(unparseable proxy URL)';
  }

  // Parsing alone is not enough to echo the value back: "garbage:pa55@@@" is a
  // valid URL with an opaque path, and returning it verbatim would disclose the
  // password. Only something shaped like a proxy URL is ever repeated.
  if (!ALLOWED_SCHEMES.includes(url.protocol) || !url.hostname) {
    return '(unparseable proxy URL)';
  }

  if (!url.password) {
    return trimmed;
  }

  const port = url.port ? `:${url.port}` : '';
  return `${url.protocol}//${url.username}:***@${url.hostname.toLowerCase()}${port}`;
}

function buildCredentials(username: string, password: string): string {
  if (!username && !password) return '';
  return `${username}:${password}@`;
}
