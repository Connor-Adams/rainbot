import { fetchAndSetYtProxy, startYtProxyRefresh } from '../ytProxy';

function proxyResponse(body: string) {
  return { status: 200, ok: true, text: async () => body };
}

describe('fetchAndSetYtProxy', () => {
  const realFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env['RAINCLOUD_URL'] = 'http://raincloud.railway.internal:3000';
    process.env['WORKER_SECRET'] = 'shh';
    delete process.env['YTDLP_PROXY'];
    delete process.env['YTDLP_PROXY_OVERRIDE'];
  });

  afterEach(() => {
    global.fetch = realFetch;
  });

  it('sets YTDLP_PROXY from raincloud', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(proxyResponse('socks5://u:p@proxy.example.com:1080'));

    await fetchAndSetYtProxy();

    expect(process.env['YTDLP_PROXY']).toBe('socks5://u:p@proxy.example.com:1080');
  });

  it('sends the worker secret, since the endpoint returns credentials', async () => {
    const fetchMock = jest.fn().mockResolvedValue(proxyResponse('http://proxy.example.com:8080'));
    global.fetch = fetchMock;

    await fetchAndSetYtProxy();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://raincloud.railway.internal:3000/internal/proxy/youtube');
    expect(init.headers).toMatchObject({ 'x-worker-secret': 'shh' });
  });

  it('clears a previously set proxy when the dashboard removes it', async () => {
    global.fetch = jest.fn().mockResolvedValue(proxyResponse('http://proxy.example.com:8080'));
    await fetchAndSetYtProxy();
    expect(process.env['YTDLP_PROXY']).toBe('http://proxy.example.com:8080');

    global.fetch = jest.fn().mockResolvedValue({ status: 404, ok: false, text: async () => '' });
    await fetchAndSetYtProxy();

    expect(process.env['YTDLP_PROXY']).toBeUndefined();
  });

  it('rejects a malformed stored value rather than handing it to yt-dlp', async () => {
    global.fetch = jest.fn().mockResolvedValue(proxyResponse('ftp://nope.example.com'));

    await fetchAndSetYtProxy();

    expect(process.env['YTDLP_PROXY']).toBeUndefined();
  });

  it('leaves a manual YTDLP_PROXY_OVERRIDE alone', async () => {
    process.env['YTDLP_PROXY_OVERRIDE'] = 'http://manual.example.com:3128';
    const fetchMock = jest.fn();
    global.fetch = fetchMock;

    await fetchAndSetYtProxy();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(process.env['YTDLP_PROXY']).toBe('http://manual.example.com:3128');
  });

  it('keeps the current proxy when raincloud is unreachable', async () => {
    global.fetch = jest.fn().mockResolvedValue(proxyResponse('http://proxy.example.com:8080'));
    await fetchAndSetYtProxy();

    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    await fetchAndSetYtProxy();

    // A transient raincloud outage must not silently drop the proxy and send
    // traffic out of the datacenter IP.
    expect(process.env['YTDLP_PROXY']).toBe('http://proxy.example.com:8080');
  });

  it('does nothing without RAINCLOUD_URL or WORKER_SECRET', async () => {
    delete process.env['WORKER_SECRET'];
    const fetchMock = jest.fn();
    global.fetch = fetchMock;

    await fetchAndSetYtProxy();

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('startYtProxyRefresh', () => {
  it('returns an unref-ed timer so it cannot hold the process open', () => {
    const timer = startYtProxyRefresh(60_000);

    expect(typeof timer.unref).toBe('function');
    clearInterval(timer);
  });
});
