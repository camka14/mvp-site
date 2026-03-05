/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  products: {
    findUnique: jest.fn(),
  },
  templateDocuments: {
    findMany: jest.fn(),
  },
  signedDocuments: {
    findMany: jest.fn(),
  },
};

const requireSessionMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));

import { POST } from '@/app/api/billing/purchase-intent/route';

const jsonPost = (body: unknown) =>
  new NextRequest('http://localhost/api/billing/purchase-intent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('POST /api/billing/purchase-intent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    prismaMock.products.findUnique.mockResolvedValue(null);
    process.env.STRIPE_SECRET_KEY = '';
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_test_mock';
  });

  it('blocks rental checkout when required rental document has not been signed', async () => {
    prismaMock.templateDocuments.findMany.mockResolvedValue([
      {
        id: 'tmpl_rental_1',
        title: 'Rental Agreement',
        signOnce: false,
      },
    ]);
    prismaMock.signedDocuments.findMany.mockResolvedValue([]);

    const res = await POST(jsonPost({
      user: { $id: 'user_1' },
      event: { $id: 'event_1', price: 2500, eventType: 'EVENT' },
      timeSlot: { $id: 'slot_1', price: 2500, rentalDocumentTemplateId: 'tmpl_rental_1' },
    }));
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(String(data.error ?? '')).toContain('must be signed');
  });

  it('creates a payment intent when rental document is already signed', async () => {
    prismaMock.templateDocuments.findMany.mockResolvedValue([
      {
        id: 'tmpl_rental_1',
        title: 'Rental Agreement',
        signOnce: false,
      },
    ]);
    prismaMock.signedDocuments.findMany.mockResolvedValue([
      { status: 'SIGNED' },
    ]);

    const res = await POST(jsonPost({
      user: { $id: 'user_1' },
      event: { $id: 'event_1', price: 2500, eventType: 'EVENT' },
      timeSlot: { $id: 'slot_1', price: 2500, rentalDocumentTemplateId: 'tmpl_rental_1' },
    }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(String(data.paymentIntent ?? '')).toContain('pi_mock_');
  });

  it('blocks rental checkout when any required rental document template is unsigned', async () => {
    prismaMock.templateDocuments.findMany.mockResolvedValue([
      {
        id: 'tmpl_rental_1',
        title: 'Rental Agreement',
        signOnce: false,
      },
      {
        id: 'tmpl_rental_2',
        title: 'Damage Waiver',
        signOnce: false,
      },
    ]);
    prismaMock.signedDocuments.findMany
      .mockResolvedValueOnce([{ status: 'SIGNED' }])
      .mockResolvedValueOnce([]);

    const res = await POST(jsonPost({
      user: { $id: 'user_1' },
      event: { $id: 'event_1', price: 2500, eventType: 'EVENT' },
      timeSlot: {
        $id: 'slot_1',
        price: 2500,
        rentalDocumentTemplateId: 'tmpl_rental_1',
        rentalDocumentTemplateIds: ['tmpl_rental_1', 'tmpl_rental_2', 'tmpl_rental_1'],
      },
    }));
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(String(data.error ?? '')).toContain('Damage Waiver');
  });
});
