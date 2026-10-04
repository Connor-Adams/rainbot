import { getYtdlpOptions, withStickyProxySession } from '../audioResource';

describe('getYtdlpOptions', () => {
  beforeEach(() => {
    delete process.env['YTDLP_JS_RUNTIME'];
    delete process.env['YTDLP_EXTRACTOR_ARGS'];
    delete process.env['YTDLP_COOKIES'];
    delete process.env['YTDLP_PROXY'];
  });

  it('points yt-dlp at node, since only deno is enabled by default', () => {
    expect(getYtdlpOptions()).toMatchObject({ jsRuntimes: 'node' });
  });

  it('honours YTDLP_JS_RUNTIME when another runtime is installed', () => {
    process.env['YTDLP_JS_RUNTIME'] = 'deno';

    expect(getYtdlpOptions()).toMatchObject({ jsRuntimes: 'deno' });
  });

  it('leaves warnings on, so a missing JS runtime or component is visible', () => {
    expect(getYtdlpOptions()).not.toHaveProperty('noWarnings');
  });

  it('pins no player client unless YTDLP_EXTRACTOR_ARGS asks for one', () => {
    expect(getYtdlpOptions()).not.toHaveProperty('extractorArgs');

    process.env['YTDLP_EXTRACTOR_ARGS'] = 'youtube:player_client=tv';

    expect(getYtdlpOptions()).toMatchObject({ extractorArgs: 'youtube:player_client=tv' });
  });

  it('ignores a blank or whitespace-only extractor-args value', () => {
    process.env['YTDLP_EXTRACTOR_ARGS'] = '   ';

    expect(getYtdlpOptions()).not.toHaveProperty('extractorArgs');
  });

  it('goes direct when no proxy is configured', () => {
    expect(getYtdlpOptions()).not.toHaveProperty('proxy');
  });

  it('routes yt-dlp through YTDLP_PROXY when the dashboard has set one', () => {
    process.env['YTDLP_PROXY'] = 'socks5://user:pa55@proxy.example.com:1080';

    expect(getYtdlpOptions()).toMatchObject({
      proxy: 'socks5://user:pa55@proxy.example.com:1080',
    });
  });

  it('ignores a blank proxy value', () => {
    process.env['YTDLP_PROXY'] = '  ';

    expect(getYtdlpOptions()).not.toHaveProperty('proxy');
  });

  it('pins a nimbleway proxy to one exit IP for the whole yt-dlp call', () => {
    process.env['YTDLP_PROXY'] = 'http://account-acme-pipeline-res:secret@ip.nimbleway.com:7000';

    const proxy = getYtdlpOptions()['proxy'] as string;

    expect(proxy).toMatch(
      /^http:\/\/account-acme-pipeline-res-session-[a-z0-9]{16}:secret@ip\.nimbleway\.com:7000$/
    );
  });
});

describe('withStickyProxySession', () => {
  const nimble = 'http://account-acme-pipeline-res:secret@ip.nimbleway.com:7000';

  it('gives each call its own session, so tracks spread across IPs', () => {
    expect(withStickyProxySession(nimble)).not.toBe(withStickyProxySession(nimble));
  });

  it('keeps a session the operator already pinned', () => {
    const pinned = 'http://account-acme-pipeline-res-session-mine:secret@ip.nimbleway.com:7000';

    expect(withStickyProxySession(pinned)).toBe(pinned);
  });

  it('leaves other providers alone, since their session syntax differs', () => {
    const other = 'socks5://user:pa55@proxy.example.com:1080';

    expect(withStickyProxySession(other)).toBe(other);
  });

  it('passes through a value it cannot parse', () => {
    expect(withStickyProxySession('not a url')).toBe('not a url');
  });
});
