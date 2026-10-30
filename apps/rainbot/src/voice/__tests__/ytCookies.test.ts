import * as fs from 'fs';
import play from 'play-dl';
import { fetchAndSetYtCookies, netscapeCookiesToHeader, startYtCookieRefresh } from '../ytCookies';

jest.mock('play-dl', () => ({
  __esModule: true,
  default: { setToken: jest.fn().mockResolvedValue(undefined) },
}));

const setToken = play.setToken as jest.Mock;

function cookieResponse(body: string) {
  return { status: 200, ok: true, text: async () => body };
}

function netscapeFile(...lines: string[][]): string {
  const header = '# Netscape HTTP Cookie File\n';
  return header + lines.map((fields) => fields.join('\t')).join('\n') + '\n';
}

describe('netscapeCookiesToHeader', () => {
  it('converts youtube.com entries into a Cookie header', () => {
    const text = netscapeFile(
      ['.youtube.com', 'TRUE', '/', 'TRUE', '1780000000', 'SID', 'sid-value'],
      ['.youtube.com', 'TRUE', '/', 'TRUE', '1780000000', 'HSID', 'hsid-value']
    );

    expect(netscapeCookiesToHeader(text)).toBe('SID=sid-value; HSID=hsid-value');
  });

  it('keeps #HttpOnly_ entries, which hold the session cookies that matter', () => {
    const text = netscapeFile([
      '#HttpOnly_.youtube.com',
      'TRUE',
      '/',
      'TRUE',
      '1780000000',
      '__Secure-1PSID',
      'secure-value',
    ]);

    expect(netscapeCookiesToHeader(text)).toBe('__Secure-1PSID=secure-value');
  });

  it('drops comments, blank lines, short rows and other domains', () => {
    const text = [
      '# Netscape HTTP Cookie File',
      '',
      '.google.com\tTRUE\t/\tTRUE\t1780000000\tNID\tnid-value',
      '.notyoutube.com\tTRUE\t/\tTRUE\t1780000000\tFAKE\tfake-value',
      '.youtube.com\tTRUE\t/\tTRUE\t1780000000',
      '.youtube.com\tTRUE\t/\tTRUE\t1780000000\tSID\tsid-value',
    ].join('\n');

    expect(netscapeCookiesToHeader(text)).toBe('SID=sid-value');
  });

  it('returns an empty string when the body is not a cookie file', () => {
    expect(netscapeCookiesToHeader('not a cookie file')).toBe('');
  });
});

describe('fetchAndSetYtCookies', () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    delete process.env['YTDLP_COOKIES'];
    process.env['WORKER_SECRET'] = 'secret';
    fetchMock = jest.fn().mockResolvedValue({ status: 404, ok: false });
    global.fetch = fetchMock as never;
    setToken.mockClear();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env['RAINCLOUD_URL'];
    delete process.env['WORKER_SECRET'];
  });

  it('resolves a host-only RAINCLOUD_URL the same way worker registration does', async () => {
    process.env['RAINCLOUD_URL'] = 'raincloud';

    await fetchAndSetYtCookies();

    expect(fetchMock).toHaveBeenCalledWith(
      'http://raincloud:3000/internal/cookies/youtube',
      expect.anything()
    );
  });

  it('replaces cookies it loaded earlier instead of skipping the refetch', async () => {
    process.env['RAINCLOUD_URL'] = 'http://localhost:3000';
    fetchMock.mockResolvedValue(cookieResponse('cookies-v1'));

    await fetchAndSetYtCookies();
    const cookiesPath = process.env['YTDLP_COOKIES'];
    expect(cookiesPath).toBeTruthy();

    fetchMock.mockResolvedValue(cookieResponse('cookies-v2'));
    await fetchAndSetYtCookies();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fs.readFileSync(cookiesPath as string, 'utf8')).toBe('cookies-v2');
  });

  it('never overwrites a manually configured YTDLP_COOKIES', async () => {
    process.env['RAINCLOUD_URL'] = 'http://localhost:3000';
    process.env['YTDLP_COOKIES'] = '/tmp/manually-configured-cookies.txt';

    await fetchAndSetYtCookies();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(process.env['YTDLP_COOKIES']).toBe('/tmp/manually-configured-cookies.txt');
  });

  it('refetches cookies on an interval so a dashboard upload lands without a restart', async () => {
    jest.useFakeTimers();
    process.env['RAINCLOUD_URL'] = 'http://localhost:3000';
    fetchMock.mockResolvedValue(cookieResponse('cookies-v1'));

    const timer = startYtCookieRefresh(60_000);
    try {
      expect(fetchMock).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(150_000);

      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      clearInterval(timer);
      jest.useRealTimers();
    }
  });

  it('hands the cookies to play-dl so the fallback is authenticated too', async () => {
    process.env['RAINCLOUD_URL'] = 'http://localhost:3000';
    fetchMock.mockResolvedValue(
      cookieResponse(netscapeFile(['.youtube.com', 'TRUE', '/', 'TRUE', '1780000000', 'SID', 'v']))
    );

    await fetchAndSetYtCookies();

    expect(setToken).toHaveBeenCalledWith({ youtube: { cookie: 'SID=v' } });
  });

  it('leaves play-dl alone when the body carries no youtube.com cookies', async () => {
    process.env['RAINCLOUD_URL'] = 'http://localhost:3000';
    fetchMock.mockResolvedValue(cookieResponse('# Netscape HTTP Cookie File\n'));

    await fetchAndSetYtCookies();

    expect(setToken).not.toHaveBeenCalled();
  });

  it('says whether it loaded cookies, which the upload push reports back to the dashboard', async () => {
    process.env['RAINCLOUD_URL'] = 'http://localhost:3000';

    fetchMock.mockResolvedValue(cookieResponse('jar-v1'));
    await expect(fetchAndSetYtCookies()).resolves.toBe(true);

    fetchMock.mockResolvedValue({ status: 404, ok: false });
    await expect(fetchAndSetYtCookies()).resolves.toBe(false);

    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(fetchAndSetYtCookies()).resolves.toBe(false);
  });

  it('keeps an absolute RAINCLOUD_URL', async () => {
    process.env['RAINCLOUD_URL'] = 'https://raincloud.example.com:8443/';

    await fetchAndSetYtCookies();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://raincloud.example.com:8443/internal/cookies/youtube',
      expect.anything()
    );
  });
});

describe('reportStaleYtCookies', () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;
  let cookies: typeof import('../ytCookies');

  beforeEach(() => {
    delete process.env['YTDLP_COOKIES'];
    process.env['WORKER_SECRET'] = 'secret';
    process.env['RAINCLOUD_URL'] = 'http://localhost:3000';
    fetchMock = jest.fn();
    global.fetch = fetchMock as never;
    // Fresh module state: the loaded jar and the report throttle.
    jest.isolateModules(() => {
      cookies = require('../ytCookies');
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env['RAINCLOUD_URL'];
    delete process.env['WORKER_SECRET'];
  });

  function staleReports() {
    return fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/stale'));
  }

  it('reports the loaded jar by hash when raincloud still serves it', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith('/stale') ? { ok: true } : cookieResponse('jar-v1')
    );
    await cookies.fetchAndSetYtCookies();

    await cookies.reportStaleYtCookies();

    expect(staleReports()).toEqual([
      [
        'http://localhost:3000/internal/cookies/youtube/stale',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ hash: cookies.cookiesHash('jar-v1') }),
        }),
      ],
    ]);
  });

  it('loads a newer upload instead of reporting the replaced jar', async () => {
    fetchMock.mockResolvedValue(cookieResponse('jar-v1'));
    await cookies.fetchAndSetYtCookies();
    fetchMock.mockResolvedValue(cookieResponse('jar-v2'));

    await cookies.reportStaleYtCookies();

    expect(staleReports()).toHaveLength(0);
    expect(fs.readFileSync(process.env['YTDLP_COOKIES'] as string, 'utf8')).toBe('jar-v2');
  });

  it('reports at most once per window', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith('/stale') ? { ok: true } : cookieResponse('jar-v1')
    );
    await cookies.fetchAndSetYtCookies();

    await cookies.reportStaleYtCookies();
    await cookies.reportStaleYtCookies();

    expect(staleReports()).toHaveLength(1);
  });

  it('stays quiet about cookies configured by hand', async () => {
    process.env['YTDLP_COOKIES'] = '/tmp/manually-configured-cookies.txt';

    await cookies.reportStaleYtCookies();

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
