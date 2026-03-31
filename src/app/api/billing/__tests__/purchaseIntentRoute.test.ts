/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  products: {
    findUnique: jest.fn(),
  },
  teams: {
    findUnique: jest.fn(),
  },
  divisions: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
  templateDocuments: {
    findMany: jest.fn(),
  },
  signedDocuments: {
    findMany: jest.fn(),
  },
  eventRegistrations: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    deleteMany: jest.fn(),
  },
  $queryRaw: jest.fn(),
  $transaction: jest.fn(),
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
    jest.resetAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    prismaMock.products.findUnique.mockResolvedValue(null);
    prismaMock.teams.findUnique.mockResolvedValue({ id: 'team_1' });
    prismaMock.divisions.findMany.mockResolvedValue([]);
    prismaMock.divisions.findFirst.mockResolvedValue(null);
    prismaMock.eventRegistrations.findMany.mockResolvedValue([]);
    prismaMock.eventRegistrations.findUnique.mockResolvedValue(null);
    prismaMock.eventRegistrations.create.mockResolvedValue({});
    prismaMock.eventRegistrations.update.mockResolvedValue({});
    prismaMock.eventRegistrations.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.$queryRaw.mockResolvedValue([
      {
        id: 'event_1',
        start: new Date('2026-03-18T12:00:00.000Z'),
        minAge: null,
        maxAge: null,
        sportId: null,
        registrationByDivisionType: false,
        divisions: [],
        maxParticipants: null,
        teamSignup: false,
      },
    ]);
    prismaMock.$transaction.mockImplementation(async (callback: (tx: any) => Promise<unknown>) => {
      const tx = {
        $queryRaw: prismaMock.$queryRaw,
        teams: {
          findUnique: prismaMock.teams.findUnique,
        },
        divisions: {
          findFirst: prismaMock.divisions.findFirst,
        },
        eventRegistrations: {
          findMany: prismaMock.eventRegistrations.findMany,
          findUnique: prismaMock.eventRegistrations.findUnique,
          create: prismaMock.eventRegistrations.create,
          update: prismaMock.eventRegistrations.update,
          deleteMany: prismaMock.eventRegistrations.deleteMany,
        },
      };
      return callback(tx);
    });
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
      timeSlot: { $id: 'slot_1', price: 2500, requiredTemplateIds: ['tmpl_rental_1'] },
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
      timeSlot: { $id: 'slot_1', price: 2500, requiredTemplateIds: ['tmpl_rental_1'] },
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
        requiredTemplateIds: ['tmpl_rental_1', 'tmpl_rental_2', 'tmpl_rental_1'],
      },
    }));
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(String(data.error ?? '')).toContain('Damage Waiver');
  });

  it('creates STARTED registration reservation before event checkout payment intent', async () => {
    const now = new Date('2026-03-18T12:00:00.000Z');
    prismaMock.eventRegistrations.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: 'event_1__self__user_1', createdAt: now },
      ]);

    const res = await POST(jsonPost({
      user: { $id: 'user_1' },
      event: { $id: 'event_1', price: 2500, eventType: 'EVENT' },
    }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(String(data.paymentIntent ?? '')).toContain('pi_mock_');
    expect(prismaMock.eventRegistrations.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          id: 'event_1__self__user_1',
          eventId: 'event_1',
          registrantId: 'user_1',
          registrantType: 'SELF',
          status: 'STARTED',
        }),
      }),
    );
  });

  it('reuses existing registration reservation when one already exists', async () => {
    const now = new Date('2026-03-18T12:00:00.000Z');
    prismaMock.eventRegistrations.findUnique.mockResolvedValueOnce({
      id: 'event_1__self__user_1',
      status: 'STARTED',
      createdAt: now,
      divisionId: null,
      divisionTypeId: null,
      divisionTypeKey: null,
    });
    prismaMock.eventRegistrations.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: 'event_1__self__user_1', createdAt: now },
      ]);

    const res = await POST(jsonPost({
      user: { $id: 'user_1' },
      event: { $id: 'event_1', price: 2500, eventType: 'EVENT' },
    }));

    expect(res.status).toBe(200);
    expect(prismaMock.eventRegistrations.create).not.toHaveBeenCalled();
    expect(prismaMock.eventRegistrations.update).not.toHaveBeenCalled();
  });

  it('rejects event checkout when reservation queue position exceeds capacity', async () => {
    type RegistrationRow = {
      id: string;
      eventId: string;
      registrantType: string;
      status: string;
      createdAt: Date | null;
      updatedAt: Date | null;
    };
    const registrations: RegistrationRow[] = [
      {
        id: 'event_1__self__existing_user',
        eventId: 'event_1',
        registrantType: 'SELF',
        status: 'ACTIVE',
        createdAt: new Date('2020-01-01T00:00:00.000Z'),
        updatedAt: new Date('2020-01-01T00:00:00.000Z'),
      },
    ];

    prismaMock.$queryRaw.mockImplementation(async () => [
      {
        id: 'event_1',
        start: new Date('2026-03-18T12:00:00.000Z'),
        minAge: null,
        maxAge: null,
        sportId: null,
        registrationByDivisionType: false,
        divisions: [],
        maxParticipants: 1,
        teamSignup: false,
      },
    ]);

    prismaMock.eventRegistrations.findUnique.mockImplementation(async ({ where }: any) => {
      const id = String(where?.id ?? '');
      const row = registrations.find((entry) => entry.id === id);
      if (!row) return null;
      return {
        id: row.id,
        status: row.status,
        createdAt: row.createdAt,
        divisionId: null,
        divisionTypeId: null,
        divisionTypeKey: null,
      };
    });

    prismaMock.eventRegistrations.findMany.mockImplementation(async ({ where, select }: any) => {
      let rows = registrations.filter((entry) => entry.eventId === where?.eventId);
      if (Array.isArray(where?.OR)) {
        const cutoff = where.OR.find((item: any) => item?.createdAt?.lt)?.createdAt?.lt;
        rows = rows.filter((entry) => (
          entry.createdAt == null || (cutoff instanceof Date && entry.createdAt < cutoff)
        ));
      } else if (Array.isArray(where?.status?.in)) {
        rows = rows.filter((entry) => where.status.in.includes(entry.status));
      }
      if (typeof where?.registrantType === 'string') {
        rows = rows.filter((entry) => entry.registrantType === where.registrantType);
      } else if (Array.isArray(where?.registrantType?.in)) {
        rows = rows.filter((entry) => where.registrantType.in.includes(entry.registrantType));
      }
      return rows.map((entry) => {
        if (!select) return { ...entry };
        const projected: Record<string, unknown> = {};
        if (select.id) projected.id = entry.id;
        if (select.createdAt) projected.createdAt = entry.createdAt;
        return projected;
      });
    });

    prismaMock.eventRegistrations.create.mockImplementation(async ({ data }: any) => {
      registrations.push({
        id: String(data.id),
        eventId: String(data.eventId),
        registrantType: String(data.registrantType),
        status: String(data.status),
        createdAt: data.createdAt instanceof Date ? data.createdAt : new Date(),
        updatedAt: data.updatedAt instanceof Date ? data.updatedAt : new Date(),
      });
      return data;
    });

    prismaMock.eventRegistrations.deleteMany.mockImplementation(async ({ where }: any) => {
      const id = String(where?.id ?? '');
      const status = String(where?.status ?? '');
      const before = registrations.length;
      for (let index = registrations.length - 1; index >= 0; index -= 1) {
        const row = registrations[index];
        if (row.id === id && row.status === status) {
          registrations.splice(index, 1);
        }
      }
      return { count: before - registrations.length };
    });

    const res = await POST(jsonPost({
      user: { $id: 'user_1' },
      event: { $id: 'event_1', price: 2500, eventType: 'EVENT' },
    }));
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(String(data.error ?? '')).toContain('Event is full');
    expect(prismaMock.eventRegistrations.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'event_1__self__user_1',
          status: 'STARTED',
        }),
      }),
    );
  });

  it('rejects event checkout when selected division is full even if event has room', async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([
      {
        id: 'event_1',
        start: new Date('2026-03-18T12:00:00.000Z'),
        minAge: null,
        maxAge: null,
        sportId: null,
        registrationByDivisionType: false,
        divisions: ['div_a', 'div_b'],
        maxParticipants: 5,
        teamSignup: false,
      },
    ]);
    prismaMock.divisions.findMany.mockResolvedValueOnce([
      {
        id: 'div_a',
        key: 'div_a',
        name: 'Division A',
        sportId: null,
        divisionTypeId: 'adult',
        divisionTypeName: 'Adult',
        ratingType: 'AGE',
        gender: 'C',
        ageCutoffDate: null,
        ageCutoffLabel: null,
        ageCutoffSource: null,
      },
      {
        id: 'div_b',
        key: 'div_b',
        name: 'Division B',
        sportId: null,
        divisionTypeId: 'adult',
        divisionTypeName: 'Adult',
        ratingType: 'AGE',
        gender: 'C',
        ageCutoffDate: null,
        ageCutoffLabel: null,
        ageCutoffSource: null,
      },
    ]);
    prismaMock.divisions.findFirst.mockResolvedValueOnce({
      id: 'div_a',
      maxParticipants: 1,
    });
    prismaMock.eventRegistrations.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: 'event_1__self__existing_user', createdAt: new Date('2026-03-18T11:59:00.000Z') },
        { id: 'event_1__self__user_1', createdAt: new Date('2026-03-18T12:00:00.000Z') },
      ]);

    const res = await POST(jsonPost({
      user: { $id: 'user_1' },
      event: { $id: 'event_1', price: 2500, eventType: 'EVENT' },
      divisionId: 'div_a',
    }));
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(String(data.error ?? '')).toContain('Selected division is full');
    expect(prismaMock.eventRegistrations.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'event_1__self__user_1',
          status: 'STARTED',
        }),
      }),
    );
  });

  it('allows only one reservation when two users race for the final event slot', async () => {
    type RegistrationRow = {
      id: string;
      eventId: string;
      registrantId: string;
      registrantType: string;
      status: string;
      createdAt: Date | null;
      updatedAt: Date | null;
    };

    const registrations: RegistrationRow[] = [];
    let transactionQueue = Promise.resolve();

    prismaMock.$queryRaw.mockImplementation(async () => [
      {
        id: 'event_1',
        start: new Date('2026-03-18T12:00:00.000Z'),
        minAge: null,
        maxAge: null,
        sportId: null,
        registrationByDivisionType: false,
        divisions: [],
        maxParticipants: 1,
        teamSignup: false,
      },
    ]);

    prismaMock.eventRegistrations.findUnique.mockImplementation(async ({ where }: any) => {
      const id = String(where?.id ?? '');
      const row = registrations.find((entry) => entry.id === id);
      if (!row) return null;
      return {
        id: row.id,
        status: row.status,
        createdAt: row.createdAt,
      };
    });

    prismaMock.eventRegistrations.findMany.mockImplementation(async ({ where, select }: any) => {
      let rows = registrations.filter((entry) => entry.eventId === where?.eventId);

      if (typeof where?.status === 'string') {
        rows = rows.filter((entry) => entry.status === where.status);
      } else if (Array.isArray(where?.status?.in)) {
        rows = rows.filter((entry) => where.status.in.includes(entry.status));
      }

      if (Array.isArray(where?.OR)) {
        const cutoff = where.OR.find((item: any) => item?.createdAt?.lt)?.createdAt?.lt;
        rows = rows.filter((entry) => {
          if (entry.createdAt == null) return true;
          if (cutoff instanceof Date) return entry.createdAt < cutoff;
          return false;
        });
      }

      if (typeof where?.registrantType === 'string') {
        rows = rows.filter((entry) => entry.registrantType === where.registrantType);
      } else if (Array.isArray(where?.registrantType?.in)) {
        rows = rows.filter((entry) => where.registrantType.in.includes(entry.registrantType));
      }

      return rows.map((entry) => {
        if (!select) return { ...entry };
        const projected: Record<string, unknown> = {};
        if (select.id) projected.id = entry.id;
        if (select.status) projected.status = entry.status;
        if (select.createdAt) projected.createdAt = entry.createdAt;
        return projected;
      });
    });

    prismaMock.eventRegistrations.create.mockImplementation(async ({ data }: any) => {
      registrations.push({
        id: String(data.id),
        eventId: String(data.eventId),
        registrantId: String(data.registrantId),
        registrantType: String(data.registrantType),
        status: String(data.status),
        createdAt: data.createdAt instanceof Date ? data.createdAt : new Date(),
        updatedAt: data.updatedAt instanceof Date ? data.updatedAt : new Date(),
      });
      return data;
    });

    prismaMock.eventRegistrations.update.mockImplementation(async ({ where, data }: any) => {
      const id = String(where?.id ?? '');
      const row = registrations.find((entry) => entry.id === id);
      if (!row) return null;
      if (typeof data?.status === 'string') row.status = data.status;
      if (data?.updatedAt instanceof Date) row.updatedAt = data.updatedAt;
      return {
        id: row.id,
        status: row.status,
        createdAt: row.createdAt,
      };
    });

    prismaMock.eventRegistrations.deleteMany.mockImplementation(async ({ where }: any) => {
      const ids = Array.isArray(where?.id?.in)
        ? where.id.in.map((value: unknown) => String(value))
        : where?.id != null
          ? [String(where.id)]
          : [];
      const requiredStatus = typeof where?.status === 'string' ? where.status : null;
      const beforeCount = registrations.length;
      for (let index = registrations.length - 1; index >= 0; index -= 1) {
        const entry = registrations[index];
        const idMatches = ids.length === 0 || ids.includes(entry.id);
        const statusMatches = !requiredStatus || entry.status === requiredStatus;
        if (idMatches && statusMatches) {
          registrations.splice(index, 1);
        }
      }
      return { count: beforeCount - registrations.length };
    });

    prismaMock.$transaction.mockImplementation((callback: (tx: any) => Promise<unknown>) => {
      const tx = {
        $queryRaw: prismaMock.$queryRaw,
        teams: {
          findUnique: prismaMock.teams.findUnique,
        },
        divisions: {
          findFirst: prismaMock.divisions.findFirst,
        },
        eventRegistrations: {
          findMany: prismaMock.eventRegistrations.findMany,
          findUnique: prismaMock.eventRegistrations.findUnique,
          create: prismaMock.eventRegistrations.create,
          update: prismaMock.eventRegistrations.update,
          deleteMany: prismaMock.eventRegistrations.deleteMany,
        },
      };

      const run = transactionQueue.then(() => callback(tx));
      transactionQueue = run.then(() => undefined, () => undefined);
      return run;
    });

    const [firstResponse, secondResponse] = await Promise.all([
      POST(jsonPost({
        user: { $id: 'user_1' },
        event: { $id: 'event_1', price: 2500, eventType: 'EVENT' },
      })),
      POST(jsonPost({
        user: { $id: 'user_2' },
        event: { $id: 'event_1', price: 2500, eventType: 'EVENT' },
      })),
    ]);

    const firstPayload = await firstResponse.json();
    const secondPayload = await secondResponse.json();
    const statusCodes = [firstResponse.status, secondResponse.status].sort((left, right) => left - right);

    expect(statusCodes).toEqual([200, 409]);
    expect(
      [String(firstPayload.error ?? ''), String(secondPayload.error ?? '')]
        .some((message) => message.includes('Event is full')),
    ).toBe(true);
    expect(registrations.filter((entry) => entry.status === 'STARTED')).toHaveLength(1);
  });
});
