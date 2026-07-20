import { ScrapingDogClient } from '../scrapingDogClient';

describe('ScrapingDogClient', () => {
  const originalTimeout = process.env.SCRAPINGDOG_TIMEOUT_MS;

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    if (originalTimeout == null) delete process.env.SCRAPINGDOG_TIMEOUT_MS;
    else process.env.SCRAPINGDOG_TIMEOUT_MS = originalTimeout;
  });

  it('aborts a request that exceeds the configured timeout', async () => {
    jest.useFakeTimers();
    process.env.SCRAPINGDOG_TIMEOUT_MS = '10000';
    const fetchImpl = jest.fn((_input: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      });
    }));

    const request = new ScrapingDogClient('test-key', fetchImpl).fetchPage({
      url: 'https://example.com/events',
    });
    const rejection = expect(request).rejects.toThrow(
      'ScrapingDog request timed out after 10000ms.',
    );
    await jest.advanceTimersByTimeAsync(10_000);

    await rejection;
  });

  it('returns a successful response before the timeout', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '<h1>Events</h1>',
    } as Response);

    await expect(new ScrapingDogClient('test-key', fetchImpl).fetchPage({
      url: 'https://example.com/events',
    })).resolves.toEqual(expect.objectContaining({
      statusCode: 200,
      body: '<h1>Events</h1>',
    }));
  });
});
