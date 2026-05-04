/** @jest-environment node */

import { NextRequest } from 'next/server';

const eventsMock = {
  findUnique: jest.fn(),
};

const prismaMock = {
  events: eventsMock,
};

const requireSessionMock = jest.fn();
const canManageEventMock = jest.fn();
const mockPngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const mockQrPng = Buffer.concat([mockPngSignature, Buffer.from('qr')]);
const mockLogoPng = Buffer.from('logo-png');
const mockFinalPng = Buffer.concat([mockPngSignature, Buffer.alloc(12_000)]);
const mockSharp = jest.fn((input: Buffer) => {
  const api = {
    resize: jest.fn(() => api),
    composite: jest.fn(() => api),
    png: jest.fn(() => api),
    toBuffer: jest.fn(async () => (input === mockQrPng ? mockFinalPng : mockLogoPng)),
  };
  return api;
});

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/server/accessControl', () => ({
  canManageEvent: (...args: unknown[]) => canManageEventMock(...args),
}));
jest.mock('qrcode', () => ({
  __esModule: true,
  default: {
    toBuffer: jest.fn(async () => mockQrPng),
  },
}));
jest.mock('sharp', () => ({
  __esModule: true,
  default: mockSharp,
}));

import { GET as eventQrGet } from '@/app/api/events/[eventId]/qr/route';
import QRCode from 'qrcode';

const qrRequest = (eventId: string) =>
  new NextRequest(`http://localhost/api/events/${eventId}/qr`);

describe('event QR route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    eventsMock.findUnique.mockReset();
    requireSessionMock.mockReset();
    canManageEventMock.mockReset();
  });

  it('returns a branded QR PNG for a public event', async () => {
    eventsMock.findUnique.mockResolvedValueOnce({
      id: 'event_1',
      name: 'Spring Tournament',
      state: 'PUBLISHED',
      hostId: 'host_1',
    });

    const res = await eventQrGet(qrRequest('event_1'), {
      params: Promise.resolve({ eventId: 'event_1' }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('cache-control')).toContain('public');
    expect(requireSessionMock).not.toHaveBeenCalled();
    expect(QRCode.toBuffer).toHaveBeenCalledWith(
      'http://localhost/events/event_1',
      expect.objectContaining({ errorCorrectionLevel: 'H' }),
    );
    expect(mockSharp).toHaveBeenCalledWith(mockQrPng);

    const body = Buffer.from(await res.arrayBuffer());
    expect(body.subarray(0, mockPngSignature.length)).toEqual(mockPngSignature);
    expect(body.length).toBeGreaterThan(10_000);
  });

  it('returns 404 when the event does not exist', async () => {
    eventsMock.findUnique.mockResolvedValueOnce(null);

    const res = await eventQrGet(qrRequest('missing_event'), {
      params: Promise.resolve({ eventId: 'missing_event' }),
    });

    expect(res.status).toBe(404);
  });

  it('forbids restricted event QR codes when the requester cannot manage the event', async () => {
    const event = {
      id: 'event_1',
      name: 'Private Event',
      state: 'PRIVATE',
      hostId: 'host_1',
    };
    eventsMock.findUnique.mockResolvedValueOnce(event);
    requireSessionMock.mockResolvedValueOnce({ userId: 'user_2', isAdmin: false });
    canManageEventMock.mockResolvedValueOnce(false);

    const res = await eventQrGet(qrRequest('event_1'), {
      params: Promise.resolve({ eventId: 'event_1' }),
    });

    expect(res.status).toBe(403);
    expect(requireSessionMock).toHaveBeenCalled();
    expect(canManageEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user_2' }),
      event,
    );
  });

  it('allows restricted event QR codes when the requester can manage the event', async () => {
    const event = {
      id: 'event_1',
      name: 'Private Event',
      state: 'PRIVATE',
      hostId: 'host_1',
    };
    eventsMock.findUnique.mockResolvedValueOnce(event);
    requireSessionMock.mockResolvedValueOnce({ userId: 'host_1', isAdmin: false });
    canManageEventMock.mockResolvedValueOnce(true);

    const res = await eventQrGet(qrRequest('event_1'), {
      params: Promise.resolve({ eventId: 'event_1' }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });
});
