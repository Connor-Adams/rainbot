import { getYtdlpOptions } from '../audioResource';

describe('getYtdlpOptions', () => {
  beforeEach(() => {
    delete process.env['YTDLP_JS_RUNTIME'];
    delete process.env['YTDLP_EXTRACTOR_ARGS'];
    delete process.env['YTDLP_COOKIES'];
    delete process.env['BGUTIL_POT_BASE_URL'];
    delete process.env['YTDLP_PROXY'];
  });

  it('points yt-dlp at node, since only deno is enabled by default', () => {
    expect(getYtdlpOptions()).toMatchObject({ jsRuntimes: 'node' });
  });

  it('honours YTDLP_JS_RUNTIME when another runtime is installed', () => {
    process.env['YTDLP_JS_RUNTIME'] = 'deno';

    expect(getYtdlpOptions()).toMatchObject({ jsRuntimes: 'deno' });
  });

  it('leaves warnings on, so a missing runtime or PO token provider is visible', () => {
    expect(getYtdlpOptions()).not.toHaveProperty('noWarnings');
  });

  it('pins no player client unless YTDLP_EXTRACTOR_ARGS asks for one', () => {
    expect(getYtdlpOptions()).not.toHaveProperty('extractorArgs');

    process.env['YTDLP_EXTRACTOR_ARGS'] = 'youtube:player_client=tv';

    expect(getYtdlpOptions()).toMatchObject({ extractorArgs: 'youtube:player_client=tv' });
  });

  it('leaves the PO token plugin on its bundled script when no server is set', () => {
    expect(getYtdlpOptions()).not.toHaveProperty('extractorArgs');
  });

  it('points the PO token plugin at a provider server when one is configured', () => {
    process.env['BGUTIL_POT_BASE_URL'] = 'http://bgutil.railway.internal:4416';

    expect(getYtdlpOptions()).toMatchObject({
      extractorArgs: 'youtubepot-bgutilhttp:base_url=http://bgutil.railway.internal:4416',
    });
  });

  it('keeps a pinned player client alongside the PO token server', () => {
    process.env['YTDLP_EXTRACTOR_ARGS'] = 'youtube:player_client=tv';
    process.env['BGUTIL_POT_BASE_URL'] = 'http://bgutil.railway.internal:4416';

    // dargs repeats the flag for an array, which is how yt-dlp takes more than
    // one --extractor-args.
    expect(getYtdlpOptions()).toMatchObject({
      extractorArgs: [
        'youtube:player_client=tv',
        'youtubepot-bgutilhttp:base_url=http://bgutil.railway.internal:4416',
      ],
    });
  });

  it('ignores a blank or whitespace-only provider URL', () => {
    process.env['BGUTIL_POT_BASE_URL'] = '   ';

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
});
