import { getYtdlpOptions } from '../audioResource';

describe('getYtdlpOptions', () => {
  beforeEach(() => {
    delete process.env['YTDLP_JS_RUNTIME'];
    delete process.env['YTDLP_EXTRACTOR_ARGS'];
    delete process.env['YTDLP_COOKIES'];
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
});
