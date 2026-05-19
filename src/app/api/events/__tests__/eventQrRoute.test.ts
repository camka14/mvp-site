/** @jest-environment node */

import { NextRequest } from 'next/server';
import { Readable } from 'node:stream';

const eventsMock = {
  findUnique: jest.fn(),
};
const organizationsMock = {
  findUnique: jest.fn(),
};
const fileMock = {
  findUnique: jest.fn(),
};

const prismaMock = {
  events: eventsMock,
  organizations: organizationsMock,
  file: fileMock,
};

const requireSessionMock = jest.fn();
const canManageEventMock = jest.fn();
const mockReadFile = jest.fn(async (filePath: string) => Buffer.from(String(filePath)));
const mockStorageProvider = {
  getObjectStream: jest.fn(),
};
const mockPngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const mockStyledSvg = Buffer.from('<svg width="1024" height="1024"></svg>');
const mockOrgLogoPng = Buffer.from('org-logo-png');
const mockLogoPng = Buffer.from('logo-png');
const mockFinalPng = Buffer.concat([mockPngSignature, Buffer.alloc(12_000)]);
const mockSharpApis: Array<{
  input: Buffer;
  resize: jest.Mock;
  composite: jest.Mock;
  ensureAlpha: jest.Mock;
  png: jest.Mock;
  toBuffer: jest.Mock;
}> = [];
const mockSharp = jest.fn((input: Buffer) => {
  const api = {
    input,
    resize: jest.fn(() => api),
    composite: jest.fn(() => api),
    ensureAlpha: jest.fn(() => api),
    png: jest.fn(() => api),
    toBuffer: jest.fn(async () => (input === mockStyledSvg ? mockFinalPng : mockLogoPng)),
  };
  mockSharpApis.push(api);
  return api;
});
const mockGetRawData = jest.fn(async () => mockStyledSvg);
const mockQRCodeStyling = jest.fn(() => ({
  getRawData: mockGetRawData,
}));

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/lib/storageProvider', () => ({
  getStorageProvider: () => mockStorageProvider,
}));
jest.mock('@/server/accessControl', () => ({
  canManageEvent: (...args: unknown[]) => canManageEventMock(...args),
}));
jest.mock('node:fs/promises', () => ({
  readFile: (...args: [string]) => mockReadFile(...args),
}));
jest.mock('qr-code-styling', () => ({
  __esModule: true,
  default: mockQRCodeStyling,
}));
jest.mock('sharp', () => ({
  __esModule: true,
  default: mockSharp,
}));

import { GET as eventQrGet } from '@/app/api/events/[eventId]/qr/route';

const qrRequest = (eventId: string) =>
  new NextRequest(`http://localhost/api/events/${eventId}/qr`);

describe('event QR route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    eventsMock.findUnique.mockReset();
    organizationsMock.findUnique.mockReset();
    fileMock.findUnique.mockReset();
    requireSessionMock.mockReset();
    canManageEventMock.mockReset();
    mockReadFile.mockClear();
    mockStorageProvider.getObjectStream.mockReset();
    mockSharpApis.length = 0;
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
    expect(mockQRCodeStyling).toHaveBeenCalledWith(expect.objectContaining({
      data: 'http://localhost/events/event_1',
      image: `data:image/png;base64,${mockLogoPng.toString('base64')}`,
      type: 'svg',
      jsdom: expect.any(Function),
      qrOptions: expect.objectContaining({ errorCorrectionLevel: 'H' }),
      dotsOptions: expect.objectContaining({ type: 'rounded' }),
      cornersSquareOptions: expect.objectContaining({ type: 'extra-rounded' }),
      imageOptions: expect.objectContaining({
        saveAsBlob: false,
        hideBackgroundDots: true,
      }),
    }));
    expect(mockGetRawData).toHaveBeenCalledWith('svg');
    expect(mockReadFile).toHaveBeenCalledWith(expect.stringContaining('BIQ_drawing.svg'));
    const roundedLogoRenderer = mockSharpApis.find((api) => api.input === mockLogoPng);
    expect(roundedLogoRenderer?.composite).toHaveBeenCalledWith([
      expect.objectContaining({
        blend: 'dest-in',
        input: expect.any(Buffer),
      }),
    ]);
    expect(mockSharp).toHaveBeenCalledWith(mockStyledSvg);
    const finalQrRenderer = mockSharpApis.find((api) => api.input === mockStyledSvg);
    expect(finalQrRenderer?.composite).not.toHaveBeenCalled();

    const body = Buffer.from(await res.arrayBuffer());
    expect(body.subarray(0, mockPngSignature.length)).toEqual(mockPngSignature);
    expect(body.length).toBeGreaterThan(10_000);
  });

  it('uses the organization logo for organization event QR codes', async () => {
    eventsMock.findUnique.mockResolvedValueOnce({
      id: 'event_1',
      name: 'Spring Tournament',
      state: 'PUBLISHED',
      hostId: 'host_1',
      organizationId: 'org_1',
    });
    organizationsMock.findUnique.mockResolvedValueOnce({ logoId: 'file_logo_1' });
    fileMock.findUnique.mockResolvedValueOnce({
      id: 'file_logo_1',
      path: 'logos/org.png',
      bucket: 'bucket_1',
      mimeType: 'image/png',
    });
    mockStorageProvider.getObjectStream.mockResolvedValueOnce({
      stream: Readable.from([mockOrgLogoPng]),
      contentType: 'image/png',
    });

    const res = await eventQrGet(qrRequest('event_1'), {
      params: Promise.resolve({ eventId: 'event_1' }),
    });

    expect(res.status).toBe(200);
    expect(organizationsMock.findUnique).toHaveBeenCalledWith({
      where: { id: 'org_1' },
      select: { logoId: true },
    });
    expect(fileMock.findUnique).toHaveBeenCalledWith({ where: { id: 'file_logo_1' } });
    expect(mockStorageProvider.getObjectStream).toHaveBeenCalledWith({
      key: 'logos/org.png',
      bucket: 'bucket_1',
    });
    expect(mockReadFile).not.toHaveBeenCalled();
    expect(mockSharp).toHaveBeenCalledWith(mockOrgLogoPng);
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
      name: 'Draft Event',
      state: 'UNPUBLISHED',
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
      name: 'Draft Event',
      state: 'DRAFT',
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

  it('allows private event QR codes without requiring manager auth', async () => {
    eventsMock.findUnique.mockResolvedValueOnce({
      id: 'event_1',
      name: 'Private Event',
      state: 'PRIVATE',
      hostId: 'host_1',
    });

    const res = await eventQrGet(qrRequest('event_1'), {
      params: Promise.resolve({ eventId: 'event_1' }),
    });

    expect(res.status).toBe(200);
    expect(requireSessionMock).not.toHaveBeenCalled();
    expect(canManageEventMock).not.toHaveBeenCalled();
  });
});
