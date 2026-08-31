import { fetchAndSetYtCookies } from '../ytCookies';

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

  it('keeps an absolute RAINCLOUD_URL', async () => {
    process.env['RAINCLOUD_URL'] = 'https://raincloud.example.com:8443/';

    await fetchAndSetYtCookies();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://raincloud.example.com:8443/internal/cookies/youtube',
      expect.anything()
    );
  });
});
