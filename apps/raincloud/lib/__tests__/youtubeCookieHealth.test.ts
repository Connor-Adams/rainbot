import { createHash } from 'crypto';

jest.mock('@rainbot/utils/storage', () => ({
  getYoutubeCookies: jest.fn(),
}));

const storage = jest.requireMock('@rainbot/utils/storage') as { getYoutubeCookies: jest.Mock };

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

function loadHealth(): typeof import('../youtubeCookieHealth') {
  let mod!: typeof import('../youtubeCookieHealth');
  jest.isolateModules(() => {
    mod = require('../youtubeCookieHealth');
  });
  return mod;
}

beforeEach(() => {
  storage.getYoutubeCookies.mockReset().mockResolvedValue(Buffer.from('jar-v1'));
});

describe('youtube cookie health', () => {
  it('is healthy until a worker reports the stored jar', async () => {
    const health = loadHealth();

    expect(await health.getCookieHealth()).toEqual({ stale: false, staleSince: null });
  });

  it('flags the stored jar once a worker reports it, from the first report', async () => {
    const health = loadHealth();

    health.reportStaleCookies(sha256('jar-v1'), new Date('2026-10-28T10:00:00Z'));
    health.reportStaleCookies(sha256('jar-v1'), new Date('2026-10-28T11:00:00Z'));

    expect(await health.getCookieHealth()).toEqual({
      stale: true,
      staleSince: '2026-10-28T10:00:00.000Z',
    });
  });

  it('ignores a report about a jar that is no longer stored', async () => {
    const health = loadHealth();

    // A worker still on the old jar after an upload.
    health.reportStaleCookies(sha256('jar-v0'));

    expect(await health.getCookieHealth()).toEqual({ stale: false, staleSince: null });
  });

  it('clears on upload and re-reads the stored jar', async () => {
    const health = loadHealth();
    health.reportStaleCookies(sha256('jar-v1'));
    expect((await health.getCookieHealth()).stale).toBe(true);

    storage.getYoutubeCookies.mockResolvedValue(Buffer.from('jar-v2'));
    health.onCookiesChanged();
    expect((await health.getCookieHealth()).stale).toBe(false);

    health.reportStaleCookies(sha256('jar-v2'));
    expect((await health.getCookieHealth()).stale).toBe(true);
  });

  it('is never stale when no jar is stored', async () => {
    storage.getYoutubeCookies.mockResolvedValue(null);
    const health = loadHealth();

    health.reportStaleCookies(sha256('jar-v1'));

    expect((await health.getCookieHealth()).stale).toBe(false);
  });
});
