/** @jest-environment node */

import { NextRequest } from 'next/server';

const qrGetRawDataMock = jest.fn();
const qrCodeStylingMock = jest.fn(() => ({
  getRawData: (...args: unknown[]) => qrGetRawDataMock(...args),
}));
const sharpToBufferMock = jest.fn();
const sharpMock = jest.fn(() => ({
  png: () => ({
    toBuffer: (...args: unknown[]) => sharpToBufferMock(...args),
  }),
}));

jest.mock('qr-code-styling', () => ({
  __esModule: true,
  default: qrCodeStylingMock,
}));
jest.mock('sharp', () => ({
  __esModule: true,
  default: sharpMock,
}));

import { GET } from '@/app/api/billing/checkout-qr/route';

describe('GET /api/billing/checkout-qr', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    qrGetRawDataMock.mockResolvedValue(Buffer.from('<svg />'));
    sharpToBufferMock.mockResolvedValue(Buffer.from('png-bytes'));
  });

  it('renders a PNG QR code for Stripe Checkout URLs', async () => {
    const checkoutUrl = encodeURIComponent('https://checkout.stripe.com/c/pay/cs_test_1');
    const response = await GET(
      new NextRequest(`http://localhost/api/billing/checkout-qr?url=${checkoutUrl}`),
    );
    const body = Buffer.from(await response.arrayBuffer()).toString('utf8');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(body).toBe('png-bytes');
    expect(qrCodeStylingMock).toHaveBeenCalledWith(expect.objectContaining({
      data: 'https://checkout.stripe.com/c/pay/cs_test_1',
    }));
    expect(sharpMock).toHaveBeenCalledWith(Buffer.from('<svg />'));
  });

  it('rejects unsupported checkout URL origins', async () => {
    const checkoutUrl = encodeURIComponent('https://example.com/pay/cs_test_1');
    const response = await GET(
      new NextRequest(`http://localhost/api/billing/checkout-qr?url=${checkoutUrl}`),
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe('Unsupported checkout URL.');
    expect(qrCodeStylingMock).not.toHaveBeenCalled();
  });
});
