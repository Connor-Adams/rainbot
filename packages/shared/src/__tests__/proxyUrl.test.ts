import { maskProxyUrl, normalizeProxyUrl, ProxyUrlError } from '../proxyUrl';

describe('normalizeProxyUrl', () => {
  it('accepts the schemes yt-dlp can actually use', () => {
    for (const scheme of ['http', 'https', 'socks4', 'socks4a', 'socks5', 'socks5h']) {
      expect(normalizeProxyUrl(`${scheme}://proxy.example.com:8080`)).toBe(
        `${scheme}://proxy.example.com:8080`
      );
    }
  });

  it('trims surrounding whitespace, which pasted URLs usually carry', () => {
    expect(normalizeProxyUrl('  http://proxy.example.com:8080  ')).toBe(
      'http://proxy.example.com:8080'
    );
  });

  it('keeps credentials, since most paid proxies authenticate that way', () => {
    expect(normalizeProxyUrl('http://user:pa55@proxy.example.com:8080')).toBe(
      'http://user:pa55@proxy.example.com:8080'
    );
  });

  it('lowercases the scheme and host but leaves credentials alone', () => {
    expect(normalizeProxyUrl('SOCKS5://User:Pass@Proxy.Example.COM:1080')).toBe(
      'socks5://User:Pass@proxy.example.com:1080'
    );
  });

  it('rejects a scheme yt-dlp cannot use', () => {
    expect(() => normalizeProxyUrl('ftp://proxy.example.com:8080')).toThrow(ProxyUrlError);
    expect(() => normalizeProxyUrl('file:///etc/passwd')).toThrow(ProxyUrlError);
  });

  it('rejects input that is not a URL at all', () => {
    expect(() => normalizeProxyUrl('proxy.example.com:8080')).toThrow(ProxyUrlError);
    expect(() => normalizeProxyUrl('not a url')).toThrow(ProxyUrlError);
  });

  it('rejects empty input', () => {
    expect(() => normalizeProxyUrl('')).toThrow(ProxyUrlError);
    expect(() => normalizeProxyUrl('   ')).toThrow(ProxyUrlError);
  });

  it('rejects a URL with no host', () => {
    expect(() => normalizeProxyUrl('http://')).toThrow(ProxyUrlError);
  });

  it('rejects a URL carrying a path, query or fragment', () => {
    // yt-dlp wants an origin; anything after it is silently ignored, which
    // hides typos like a copied "…:8080/setup" URL.
    expect(() => normalizeProxyUrl('http://proxy.example.com:8080/path')).toThrow(ProxyUrlError);
    expect(() => normalizeProxyUrl('http://proxy.example.com:8080?a=1')).toThrow(ProxyUrlError);
  });

  it('allows a bare host with no port', () => {
    expect(normalizeProxyUrl('http://proxy.example.com')).toBe('http://proxy.example.com');
  });
});

describe('maskProxyUrl', () => {
  it('hides the password but keeps enough to recognise the proxy', () => {
    expect(maskProxyUrl('http://user:pa55@proxy.example.com:8080')).toBe(
      'http://user:***@proxy.example.com:8080'
    );
  });

  it('leaves a credential-free URL untouched', () => {
    expect(maskProxyUrl('socks5://proxy.example.com:1080')).toBe('socks5://proxy.example.com:1080');
  });

  it('masks a password-only credential', () => {
    expect(maskProxyUrl('http://:pa55@proxy.example.com:8080')).toBe(
      'http://:***@proxy.example.com:8080'
    );
  });

  it('never returns the password even when the URL will not parse', () => {
    // Anything unparseable is withheld entirely rather than echoed back.
    expect(maskProxyUrl('garbage:pa55@@@')).toBe('(unparseable proxy URL)');
    expect(maskProxyUrl('garbage:pa55@@@')).not.toContain('pa55');
  });

  it('returns an empty string for empty input', () => {
    expect(maskProxyUrl('')).toBe('');
  });
});
