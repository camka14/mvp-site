/** @jest-environment node */

import {
  createPublicRemoteImageDownloader,
  isPublicNetworkAddress,
  parsePublicRemoteImageUrl,
  type PublicRemoteImageDependencies,
  type PublicRemoteImageResponse,
} from '@/server/publicRemoteImage';

const response = ({
  statusCode = 200,
  headers = { 'content-type': 'image/png' },
  chunks = [Buffer.from('image')],
}: {
  statusCode?: number;
  headers?: Record<string, string>;
  chunks?: Buffer[];
} = {}): PublicRemoteImageResponse & { destroy: jest.Mock } => ({
  statusCode,
  headers,
  body: (async function* () {
    for (const chunk of chunks) yield chunk;
  })(),
  destroy: jest.fn(),
});

const dependencies = (
  overrides: Partial<PublicRemoteImageDependencies> = {},
): PublicRemoteImageDependencies => ({
  resolveHostname: jest.fn(async () => [{ address: '93.184.216.34', family: 4 as const }]),
  request: jest.fn(async () => response()),
  ...overrides,
});

describe('public remote image downloads', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '169.254.169.254',
    '192.168.1.2',
    '::1',
    'fc00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
    '2001:db8::1',
  ])('rejects non-public address %s', (address) => {
    expect(isPublicNetworkAddress(address)).toBe(false);
  });

  it.each(['1.1.1.1', '8.8.8.8', '2606:4700:4700::1111'])(
    'accepts public address %s',
    (address) => {
      expect(isPublicNetworkAddress(address)).toBe(true);
    },
  );

  it.each([
    'file:///etc/passwd',
    'http://user:password@example.com/logo.png',
    'http://localhost/logo.png',
    'http://service.internal/logo.png',
    'http://example.com:8080/logo.png',
    'http://127.0.0.1/logo.png',
  ])('rejects unsafe URL %s before DNS or network access', async (url) => {
    const deps = dependencies();
    const download = createPublicRemoteImageDownloader(deps);

    await expect(download(url)).rejects.toThrow();
    expect(deps.resolveHostname).not.toHaveBeenCalled();
    expect(deps.request).not.toHaveBeenCalled();
  });

  it('rejects a hostname when any DNS answer is private', async () => {
    const deps = dependencies({
      resolveHostname: jest.fn(async () => [
        { address: '93.184.216.34', family: 4 },
        { address: '10.0.0.8', family: 4 },
      ]),
    });
    const download = createPublicRemoteImageDownloader(deps);

    await expect(download('https://example.com/logo.png')).rejects.toThrow(
      'Remote image host resolves to a non-public address.',
    );
    expect(deps.request).not.toHaveBeenCalled();
  });

  it('pins the request to a validated address and revalidates redirect destinations', async () => {
    const firstResponse = response({
      statusCode: 302,
      headers: { location: 'https://cdn.example.com/logo.png' },
      chunks: [],
    });
    const imageResponse = response({ chunks: [Buffer.from('safe-image')] });
    const deps = dependencies({
      resolveHostname: jest.fn(async (hostname) => hostname === 'example.com'
        ? [{ address: '93.184.216.34', family: 4 }]
        : [{ address: '1.1.1.1', family: 4 }]),
      request: jest.fn()
        .mockResolvedValueOnce(firstResponse)
        .mockResolvedValueOnce(imageResponse),
    });
    const download = createPublicRemoteImageDownloader(deps);

    await expect(download('https://example.com/start')).resolves.toEqual(Buffer.from('safe-image'));
    expect(firstResponse.destroy).toHaveBeenCalledTimes(1);
    expect(deps.resolveHostname).toHaveBeenNthCalledWith(1, 'example.com');
    expect(deps.resolveHostname).toHaveBeenNthCalledWith(2, 'cdn.example.com');
    expect(deps.request).toHaveBeenNthCalledWith(1, expect.objectContaining({
      url: new URL('https://example.com/start'),
      address: '93.184.216.34',
      family: 4,
    }));
    expect(deps.request).toHaveBeenNthCalledWith(2, expect.objectContaining({
      url: new URL('https://cdn.example.com/logo.png'),
      address: '1.1.1.1',
      family: 4,
    }));
  });

  it('blocks a redirect to a private literal before sending the second request', async () => {
    const redirectResponse = response({
      statusCode: 302,
      headers: { location: 'http://169.254.169.254/latest/meta-data' },
      chunks: [],
    });
    const deps = dependencies({ request: jest.fn(async () => redirectResponse) });
    const download = createPublicRemoteImageDownloader(deps);

    await expect(download('https://example.com/logo')).rejects.toThrow(
      'Remote image address is not public.',
    );
    expect(deps.request).toHaveBeenCalledTimes(1);
    expect(redirectResponse.destroy).toHaveBeenCalledTimes(1);
  });

  it('rejects unsupported response content before reading it', async () => {
    const notImage = response({ headers: { 'content-type': 'text/html' } });
    const deps = dependencies({ request: jest.fn(async () => notImage) });
    const download = createPublicRemoteImageDownloader(deps);

    await expect(download('https://example.com/logo')).rejects.toThrow(
      'Remote resource is not a supported image.',
    );
    expect(notImage.destroy).toHaveBeenCalledTimes(1);
  });

  it('rejects a declared oversized response before reading it', async () => {
    const oversized = response({
      headers: {
        'content-type': 'image/png',
        'content-length': '11',
      },
      chunks: [Buffer.alloc(11)],
    });
    const deps = dependencies({ request: jest.fn(async () => oversized) });
    const download = createPublicRemoteImageDownloader(deps);

    await expect(download('https://example.com/logo', { maxBytes: 10 })).rejects.toThrow(
      'Remote image exceeds the download size limit.',
    );
    expect(oversized.destroy).toHaveBeenCalledTimes(1);
  });

  it('stops a chunked response as soon as it exceeds the byte limit', async () => {
    const oversized = response({ chunks: [Buffer.alloc(6), Buffer.alloc(5)] });
    const deps = dependencies({ request: jest.fn(async () => oversized) });
    const download = createPublicRemoteImageDownloader(deps);

    await expect(download('https://example.com/logo', { maxBytes: 10 })).rejects.toThrow(
      'Remote image exceeds the download size limit.',
    );
    expect(oversized.destroy).toHaveBeenCalledTimes(1);
  });

  it('bounds redirect chains', async () => {
    const first = response({ statusCode: 302, headers: { location: '/second' }, chunks: [] });
    const second = response({ statusCode: 302, headers: { location: '/third' }, chunks: [] });
    const deps = dependencies({
      request: jest.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second),
    });
    const download = createPublicRemoteImageDownloader(deps);

    await expect(download('https://example.com/first', { maxRedirects: 1 })).rejects.toThrow(
      'Remote image exceeded the redirect limit.',
    );
    expect(deps.request).toHaveBeenCalledTimes(2);
    expect(first.destroy).toHaveBeenCalledTimes(1);
    expect(second.destroy).toHaveBeenCalledTimes(1);
  });

  it('times out stalled DNS resolution', async () => {
    const deps = dependencies({
      resolveHostname: jest.fn(() => new Promise(() => undefined)),
    });
    const download = createPublicRemoteImageDownloader(deps);

    await expect(download('https://example.com/logo', { timeoutMs: 5 })).rejects.toThrow(
      'Remote image request timed out.',
    );
    expect(deps.request).not.toHaveBeenCalled();
  });

  it('times out a stalled response body and destroys the connection', async () => {
    const stalledResponse: PublicRemoteImageResponse & { destroy: jest.Mock } = {
      statusCode: 200,
      headers: { 'content-type': 'image/png' },
      body: {
        [Symbol.asyncIterator]: () => ({
          next: () => new Promise(() => undefined),
        }),
      },
      destroy: jest.fn(),
    };
    const deps = dependencies({ request: jest.fn(async () => stalledResponse) });
    const download = createPublicRemoteImageDownloader(deps);

    await expect(download('https://example.com/logo', { timeoutMs: 5 })).rejects.toThrow(
      'Remote image request timed out.',
    );
    expect(stalledResponse.destroy).toHaveBeenCalledTimes(1);
  });

  it('parses an ordinary public image URL without changing its identity', () => {
    expect(parsePublicRemoteImageUrl('https://example.com/logo.png').toString()).toBe(
      'https://example.com/logo.png',
    );
  });
});
