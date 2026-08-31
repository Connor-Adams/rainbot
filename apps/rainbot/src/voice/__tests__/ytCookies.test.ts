import * as fs from 'fs';
import { fetchAndSetYtCookies, startYtCookieRefresh } from '../ytCookies';

function cookieResponse(body: string) {
  return { status: 200, ok: true, text: async () => body };
}

describe('fetchAndSetYtCookies', () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    delete process.env['YTDLP_COOKIES'];
    process.env['WORKER_SECRET'] = 'secret';
    fetchMock = jest.fn().mockResolvedValue({ status: 404, ok: false });
    global.fetch = fetchMock as never;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env['RAINCLOUD_URL'];
    delete process.env['WORKER_SECRET'];
    delete process.env['RAILWAY_ENVIRONMENT'];
  });

  it('resolves a host-only RAINCLOUD_URL the same way worker registration does', async () => {
    process.env['RAINCLOUD_URL'] = 'raincloud.railway.internal';
    process.env['RAILWAY_ENVIRONMENT'] = 'production';

    await fetchAndSetYtCookies();

    expect(fetchMock).toHaveBeenCalledWith(
      'http://raincloud.railway.internal:8080/internal/cookies/youtube',
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

  it('keeps an absolute RAINCLOUD_URL', async () => {
    process.env['RAINCLOUD_URL'] = 'https://raincloud.example.com:8443/';

    await fetchAndSetYtCookies();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://raincloud.example.com:8443/internal/cookies/youtube',
      expect.anything()
    );
  });
});
