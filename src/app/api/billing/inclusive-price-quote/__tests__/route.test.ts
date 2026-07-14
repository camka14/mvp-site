/** @jest-environment node */

import { NextRequest } from 'next/server';

const requireSessionMock = jest.fn();

jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));

import {
  MAX_INCLUSIVE_PRICE_CENTS,
  POST,
} from '@/app/api/billing/inclusive-price-quote/route';

const jsonPost = (body: unknown) => new NextRequest(
  'http://localhost/api/billing/inclusive-price-quote',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  },
);

const rawPost = (body: string) => new NextRequest(
  'http://localhost/api/billing/inclusive-price-quote',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  },
);

describe('POST /api/billing/inclusive-price-quote', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
  });

  it('quotes a host take-home amount with the server fee policy', async () => {
    const response = await POST(jsonPost({
      direction: 'HOST_AMOUNT',
      amountCents: 10_000,
      eventType: 'TOURNAMENT',
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      version: 1,
      direction: 'HOST_AMOUNT',
      breakdown: {
        hostReceivesCents: 10_000,
        processingFeeCents: 333,
        platformFeeCents: 100,
        totalPriceCents: 10_433,
        platformFeePercentage: 0.01,
      },
    });
  });

  it('quotes included fees from a total online price', async () => {
    const response = await POST(jsonPost({
      direction: 'TOTAL_PRICE',
      amountCents: 10_433,
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      version: 1,
      direction: 'TOTAL_PRICE',
      breakdown: {
        hostReceivesCents: 10_000,
        processingFeeCents: 333,
        platformFeeCents: 100,
        totalPriceCents: 10_433,
        platformFeePercentage: 0.01,
      },
    });
  });

  it.each([
    ['HOST_AMOUNT', 0],
    ['TOTAL_PRICE', 0],
  ] as const)('returns an explicit zero quote for %s', async (direction, amountCents) => {
    const response = await POST(jsonPost({ direction, amountCents }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      version: 1,
      direction,
      breakdown: {
        hostReceivesCents: 0,
        processingFeeCents: 0,
        platformFeeCents: 0,
        totalPriceCents: 0,
        platformFeePercentage: 0.01,
      },
    });
  });

  it('uses the canonical half-cent rounding boundary', async () => {
    const response = await POST(jsonPost({
      direction: 'HOST_AMOUNT',
      amountCents: 50,
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      breakdown: {
        hostReceivesCents: 50,
        platformFeeCents: 1,
        processingFeeCents: 32,
        totalPriceCents: 83,
      },
    });
  });

  it.each([
    { direction: 'UNKNOWN', amountCents: 100 },
    { direction: 'HOST_AMOUNT', amountCents: -1 },
    { direction: 'HOST_AMOUNT', amountCents: 1.5 },
    { direction: 'TOTAL_PRICE', amountCents: MAX_INCLUSIVE_PRICE_CENTS + 1 },
    { direction: 'TOTAL_PRICE', amountCents: 100, unexpected: true },
    { direction: 'TOTAL_PRICE', amountCents: 100, eventType: '' },
  ])('rejects malformed quote input %#', async (body) => {
    const response = await POST(jsonPost(body));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid inclusive price quote payload.',
    });
  });

  it('rejects malformed JSON', async () => {
    const response = await POST(rawPost('{not-json'));

    expect(response.status).toBe(400);
  });

  it('requires an authenticated session before quoting', async () => {
    requireSessionMock.mockRejectedValueOnce(new Response('Unauthorized', { status: 401 }));

    await expect(POST(jsonPost({
      direction: 'HOST_AMOUNT',
      amountCents: 100,
    }))).rejects.toMatchObject({ status: 401 });
  });
});
