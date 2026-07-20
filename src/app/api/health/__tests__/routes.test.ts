/** @jest-environment node */

const queryRawMock = jest.fn();

jest.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: (...args: unknown[]) => queryRawMock(...args),
  },
}));

import { GET as getLiveness } from '@/app/api/health/live/route';
import { GET as getReadiness } from '@/app/api/health/ready/route';

describe('health routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reports process liveness without querying the database', async () => {
    const response = getLiveness();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: 'ok' });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(queryRawMock).not.toHaveBeenCalled();
  });

  it('reports readiness after a successful database probe', async () => {
    queryRawMock.mockResolvedValueOnce([{ '?column?': 1 }]);

    const response = await getReadiness();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: 'ok', database: 'ready' });
    expect(queryRawMock).toHaveBeenCalledTimes(1);
  });

  it('returns a non-disclosing 503 when the database is unavailable', async () => {
    queryRawMock.mockRejectedValueOnce(new Error('connection details must not escape'));

    const response = await getReadiness();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      status: 'unavailable',
      database: 'unavailable',
    });
    expect(response.headers.get('retry-after')).toBe('10');
  });
});
