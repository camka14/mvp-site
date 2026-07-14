/** @jest-environment node */

const clearRemovedEventOfficialMatchAssignmentsMock = jest.fn();
const ensureAuthUserAndUserDataByEmailMock = jest.fn();

jest.mock('@/server/repositories/events', () => ({
  clearRemovedEventOfficialMatchAssignments: (...args: unknown[]) => (
    clearRemovedEventOfficialMatchAssignmentsMock(...args)
  ),
}));
jest.mock('@/server/inviteUsers', () => ({
  ensureAuthUserAndUserDataByEmail: (...args: unknown[]) => (
    ensureAuthUserAndUserDataByEmailMock(...args)
  ),
}));

import {
  EventStaffRevisionConflictError,
  loadEventStaffSnapshot,
  loadLockedEventStaffSnapshot,
  reconcileEventStaffDesiredState,
} from '@/server/events/eventStaffReconciliation';

type TestEvent = {
  id: string;
  hostId: string;
  organizationId: string | null;
  sportId: string | null;
  assistantHostIds: string[];
  fieldIds: string[];
  officialPositions: unknown[];
};

type TestOfficial = {
  id: string;
  eventId: string;
  userId: string;
  positionIds: string[];
  fieldIds: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type TestInvite = Record<string, any> & { id: string };

type TestState = {
  event: TestEvent;
  officials: TestOfficial[];
  invites: TestInvite[];
  organizationOwnerId: string | null;
  organizationStaffMembers: Array<{
    organizationId: string;
    userId: string;
    types: string[];
  }>;
  organizationStaffInvites: TestInvite[];
  sportOfficialPositionTemplates: unknown[];
  contacts: Record<string, { email: string; firstName: string; lastName: string }>;
};

const createState = (): TestState => ({
  event: {
    id: 'event_1',
    hostId: 'host_1',
    organizationId: null,
    sportId: null,
    assistantHostIds: [],
    fieldIds: ['field_1'],
    officialPositions: [{
      id: 'position_1',
      name: 'Official',
      count: 1,
      order: 0,
    }],
  },
  officials: [],
  invites: [],
  organizationOwnerId: null,
  organizationStaffMembers: [],
  organizationStaffInvites: [],
  sportOfficialPositionTemplates: [],
  contacts: {
    assistant_1: {
      email: 'assistant@example.com',
      firstName: 'Avery',
      lastName: 'Assistant',
    },
    official_1: {
      email: 'official@example.com',
      firstName: 'Olivia',
      lastName: 'Official',
    },
  },
});

const cloneState = (state: TestState): TestState => ({
  event: {
    ...state.event,
    assistantHostIds: [...state.event.assistantHostIds],
    fieldIds: [...state.event.fieldIds],
    officialPositions: structuredClone(state.event.officialPositions),
  },
  officials: state.officials.map((official) => ({
    ...official,
    positionIds: [...official.positionIds],
    fieldIds: [...official.fieldIds],
  })),
  invites: state.invites.map((invite) => ({
    ...invite,
    staffTypes: [...(invite.staffTypes ?? [])],
  })),
  organizationOwnerId: state.organizationOwnerId,
  organizationStaffMembers: structuredClone(state.organizationStaffMembers),
  organizationStaffInvites: structuredClone(state.organizationStaffInvites),
  sportOfficialPositionTemplates: structuredClone(state.sportOfficialPositionTemplates),
  contacts: structuredClone(state.contacts),
});

const makeClient = (
  state: TestState,
  options: { failOfficialUpsert?: boolean; failInviteCreate?: boolean } = {},
) => {
  const client: any = {
    events: {
      findUnique: jest.fn(async () => ({ ...state.event })),
      update: jest.fn(async ({ data }: any) => {
        if (data.assistantHostIds?.set) {
          state.event.assistantHostIds = [...data.assistantHostIds.set];
        }
        if (data.officialPositions) {
          state.event.officialPositions = structuredClone(data.officialPositions);
        }
        return { ...state.event };
      }),
    },
    eventOfficials: {
      findMany: jest.fn(async () => state.officials.map((official) => ({ ...official }))),
      deleteMany: jest.fn(async ({ where }: any) => {
        const allowed = where.userId?.notIn as string[] | undefined;
        const before = state.officials.length;
        state.officials = allowed
          ? state.officials.filter((official) => allowed.includes(official.userId))
          : [];
        return { count: before - state.officials.length };
      }),
      upsert: jest.fn(async ({ where, create, update }: any) => {
        if (options.failOfficialUpsert) {
          throw new Error('injected official write failure');
        }
        const userId = where.eventId_userId.userId;
        const index = state.officials.findIndex((official) => official.userId === userId);
        if (index >= 0) {
          state.officials[index] = {
            ...state.officials[index],
            ...update,
            positionIds: [...(update.positionIds?.set ?? state.officials[index].positionIds)],
            fieldIds: [...(update.fieldIds?.set ?? state.officials[index].fieldIds)],
          };
          return { ...state.officials[index] };
        }
        const created = {
          ...create,
          positionIds: [...create.positionIds],
          fieldIds: [...create.fieldIds],
        };
        state.officials.push(created);
        return { ...created };
      }),
    },
    invites: {
      findMany: jest.fn(async ({ where }: any) => (
        where?.organizationId
          ? state.organizationStaffInvites.map((invite) => ({ ...invite }))
          : state.invites.map((invite) => ({ ...invite }))
      )),
      deleteMany: jest.fn(async ({ where }: any) => {
        const ids = new Set<string>(where.id?.in ?? []);
        const before = state.invites.length;
        state.invites = state.invites.filter((invite) => !ids.has(invite.id));
        return { count: before - state.invites.length };
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const index = state.invites.findIndex((invite) => invite.id === where.id);
        if (index < 0) throw new Error('Invite not found');
        state.invites[index] = {
          ...state.invites[index],
          ...data,
          staffTypes: [...(data.staffTypes?.set ?? state.invites[index].staffTypes ?? [])],
        };
        return { ...state.invites[index] };
      }),
      create: jest.fn(async ({ data }: any) => {
        if (options.failInviteCreate) {
          throw new Error('injected invite write failure');
        }
        const created = { ...data, staffTypes: [...data.staffTypes] };
        state.invites.push(created);
        return { ...created };
      }),
    },
    organizations: {
      findUnique: jest.fn(async () => (
        state.event.organizationId && state.organizationOwnerId
          ? { ownerId: state.organizationOwnerId }
          : null
      )),
    },
    staffMembers: {
      findMany: jest.fn(async () => structuredClone(state.organizationStaffMembers)),
    },
    sports: {
      findUnique: jest.fn(async () => ({
        officialPositionTemplates: structuredClone(state.sportOfficialPositionTemplates),
      })),
    },
    authUser: {
      findUnique: jest.fn(async ({ where }: any) => {
        const contact = state.contacts[where.id];
        return contact ? { email: contact.email } : null;
      }),
    },
    sensitiveUserData: {
      findFirst: jest.fn(async ({ where }: any) => {
        const contact = state.contacts[where.userId];
        return contact ? { email: contact.email } : null;
      }),
    },
    userData: {
      findMany: jest.fn(async ({ where }: any) => {
        const ids = where.id.in as string[];
        return ids.filter((id) => Boolean(state.contacts[id])).map((id) => ({ id }));
      }),
      findUnique: jest.fn(async ({ where }: any) => {
        const contact = state.contacts[where.id];
        return contact
          ? { firstName: contact.firstName, lastName: contact.lastName }
          : null;
      }),
    },
  };
  return client;
};

const invite = (overrides: Record<string, any> = {}): TestInvite => ({
  id: 'invite_1',
  type: 'STAFF',
  eventId: 'event_1',
  organizationId: null,
  teamId: null,
  userId: 'assistant_1',
  email: 'assistant@example.com',
  status: 'PENDING',
  staffTypes: ['HOST'],
  createdBy: 'host_1',
  firstName: 'Avery',
  lastName: 'Assistant',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  sentAt: null,
  ...overrides,
});

describe('event staff desired-state reconciliation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearRemovedEventOfficialMatchAssignmentsMock.mockResolvedValue(0);
    ensureAuthUserAndUserDataByEmailMock.mockResolvedValue({
      userId: 'pending_1',
      authUserExisted: false,
    });
  });

  it('builds a stable revision independent of row order and timestamps', async () => {
    const state = createState();
    state.event.assistantHostIds = ['assistant_1'];
    state.invites = [
      invite({ id: 'invite_b' }),
      invite({ id: 'invite_a', userId: 'official_1', email: 'official@example.com', staffTypes: ['OFFICIAL'] }),
    ];
    const first = await loadEventStaffSnapshot(makeClient(state), 'event_1');

    state.invites.reverse();
    state.invites.forEach((row) => {
      row.updatedAt = new Date('2026-06-01T00:00:00.000Z');
      row.sentAt = new Date('2026-06-01T00:00:00.000Z');
    });
    const second = await loadEventStaffSnapshot(makeClient(state), 'event_1');

    expect(second.revision).toBe(first.revision);
  });

  it('keeps the staff revision stable when only event field and position metadata changes', async () => {
    const state = createState();
    state.officials = [{
      id: 'event_official_1',
      eventId: 'event_1',
      userId: 'official_1',
      positionIds: ['position_1'],
      fieldIds: ['field_1'],
      isActive: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    }];
    const first = await loadEventStaffSnapshot(makeClient(state), 'event_1');

    state.event.fieldIds = ['field_2'];
    state.event.officialPositions = [{
      id: 'position_2',
      name: 'Head Referee',
      count: 1,
      order: 0,
    }];
    const second = await loadEventStaffSnapshot(makeClient(state), 'event_1');

    expect(second.revision).toBe(first.revision);
    expect(second.eventOfficials).toEqual([
      expect.objectContaining({
        userId: 'official_1',
        positionIds: ['position_2'],
        fieldIds: [],
      }),
    ]);
  });

  it('loads externally returned snapshots inside the event advisory lock', async () => {
    const state = createState();
    const tx = makeClient(state);
    tx.$executeRaw = jest.fn().mockResolvedValue([]);
    const client = {
      $transaction: jest.fn(async (callback: (transaction: any) => unknown) => callback(tx)),
    };

    await loadLockedEventStaffSnapshot(client as any, 'event_1');

    expect(client.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('rejects a stale revision before any write', async () => {
    const state = createState();
    const client = makeClient(state);

    await expect(reconcileEventStaffDesiredState(client, 'event_1', {
      contractVersion: 1,
      expectedRevision: 'stale',
      assistantHostIds: ['assistant_1'],
      eventOfficials: [],
      pendingInvites: [],
    }, 'host_1')).rejects.toBeInstanceOf(EventStaffRevisionConflictError);

    expect(client.events.update).not.toHaveBeenCalled();
    expect(client.eventOfficials.deleteMany).not.toHaveBeenCalled();
    expect(client.invites.create).not.toHaveBeenCalled();
  });

  it('is idempotent and does not create duplicate staff invites on retry', async () => {
    const state = createState();
    const client = makeClient(state);
    const initial = await loadEventStaffSnapshot(client, 'event_1');
    const first = await reconcileEventStaffDesiredState(client, 'event_1', {
      contractVersion: 1,
      expectedRevision: initial.revision,
      assistantHostIds: ['assistant_1'],
      eventOfficials: [],
      pendingInvites: [],
    }, 'host_1');

    await reconcileEventStaffDesiredState(client, 'event_1', {
      contractVersion: 1,
      expectedRevision: first.snapshot.revision,
      assistantHostIds: ['assistant_1'],
      eventOfficials: [],
      pendingInvites: [],
    }, 'host_1');

    expect(state.event.assistantHostIds).toEqual(['assistant_1']);
    expect(state.invites).toHaveLength(1);
    expect(client.invites.create).toHaveBeenCalledTimes(1);
  });

  it('resolves a pending email once and commits both roles into one canonical invite', async () => {
    const state = createState();
    state.contacts.pending_1 = {
      email: 'pending@example.com',
      firstName: 'Parker',
      lastName: 'Pending',
    };
    const client = makeClient(state);
    const initial = await loadEventStaffSnapshot(client, 'event_1');

    const result = await reconcileEventStaffDesiredState(client, 'event_1', {
      contractVersion: 1,
      expectedRevision: initial.revision,
      assistantHostIds: [],
      eventOfficials: [],
      pendingInvites: [{
        email: 'pending@example.com',
        firstName: 'Parker',
        lastName: 'Pending',
        roles: ['ASSISTANT_HOST', 'OFFICIAL'],
      }],
    }, 'host_1');

    expect(state.event.assistantHostIds).toEqual(['pending_1']);
    expect(state.officials.map((row) => row.userId)).toEqual(['pending_1']);
    expect(state.invites).toHaveLength(1);
    expect(state.invites[0].staffTypes).toEqual(['HOST', 'OFFICIAL']);
    expect(result.emailCandidates).toHaveLength(1);
  });

  it('uses the sport official templates when legacy event positions are empty', async () => {
    const state = createState();
    state.event.sportId = 'sport_1';
    state.event.officialPositions = [];
    state.sportOfficialPositionTemplates = [{ name: 'Head Referee', count: 2 }];
    state.officials = [{
      id: 'official_record_1',
      eventId: 'event_1',
      userId: 'official_1',
      positionIds: ['event_pos_event_1_0_head_referee'],
      fieldIds: ['field_1'],
      isActive: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    }];
    const client = makeClient(state);

    const snapshot = await loadEventStaffSnapshot(client, 'event_1');

    expect(snapshot.officialPositions).toEqual([{
      id: 'event_pos_event_1_0_head_referee',
      name: 'Head Referee',
      count: 2,
      order: 0,
    }]);
    expect(snapshot.eventOfficials).toEqual([
      expect.objectContaining({
        userId: 'official_1',
        positionIds: ['event_pos_event_1_0_head_referee'],
      }),
    ]);
  });

  it('rejects assigning the event host through a pending assistant-host invite', async () => {
    const state = createState();
    const client = makeClient(state);
    const initial = await loadEventStaffSnapshot(client, 'event_1');
    ensureAuthUserAndUserDataByEmailMock.mockResolvedValueOnce({
      userId: 'host_1',
      authUserExisted: true,
    });

    await expect(reconcileEventStaffDesiredState(client, 'event_1', {
      contractVersion: 1,
      expectedRevision: initial.revision,
      assistantHostIds: [],
      eventOfficials: [],
      pendingInvites: [{
        email: 'host@example.com',
        firstName: 'Event',
        lastName: 'Host',
        roles: ['ASSISTANT_HOST'],
      }],
    }, 'host_1')).rejects.toThrow('The event host cannot be invited as an assistant host.');

    expect(client.events.update).not.toHaveBeenCalled();
    expect(client.invites.create).not.toHaveBeenCalled();
  });

  it('rejects event staff assignments outside the active organization roster', async () => {
    const state = createState();
    state.event.organizationId = 'organization_1';
    state.organizationOwnerId = 'host_1';
    const client = makeClient(state);
    const initial = await loadEventStaffSnapshot(client, 'event_1');

    await expect(reconcileEventStaffDesiredState(client, 'event_1', {
      contractVersion: 1,
      expectedRevision: initial.revision,
      assistantHostIds: ['assistant_1'],
      eventOfficials: [],
      pendingInvites: [],
    }, 'host_1')).rejects.toThrow(
      'Organization events can only assign active organization hosts and officials.',
    );

    expect(client.events.update).not.toHaveBeenCalled();
    expect(client.invites.create).not.toHaveBeenCalled();
  });

  it('allows active organization hosts and officials in the desired state', async () => {
    const state = createState();
    state.event.organizationId = 'organization_1';
    state.organizationOwnerId = 'host_1';
    state.organizationStaffMembers = [
      { organizationId: 'organization_1', userId: 'assistant_1', types: ['HOST'] },
      { organizationId: 'organization_1', userId: 'official_1', types: ['OFFICIAL'] },
    ];
    const client = makeClient(state);
    const initial = await loadEventStaffSnapshot(client, 'event_1');

    await reconcileEventStaffDesiredState(client, 'event_1', {
      contractVersion: 1,
      expectedRevision: initial.revision,
      assistantHostIds: ['assistant_1'],
      eventOfficials: [{
        userId: 'official_1',
        positionIds: ['position_1'],
        fieldIds: ['field_1'],
        isActive: true,
      }],
      pendingInvites: [],
    }, 'host_1');

    expect(state.event.assistantHostIds).toEqual(['assistant_1']);
    expect(state.officials.map((official) => official.userId)).toEqual(['official_1']);
  });

  it('requeues an unsent pending invite without creating a duplicate row', async () => {
    const state = createState();
    state.event.assistantHostIds = ['assistant_1'];
    state.invites = [invite({ type: 'HOST', staffTypes: [], status: 'PENDING', sentAt: null })];
    const client = makeClient(state);
    const initial = await loadEventStaffSnapshot(client, 'event_1');

    const result = await reconcileEventStaffDesiredState(client, 'event_1', {
      contractVersion: 1,
      expectedRevision: initial.revision,
      assistantHostIds: ['assistant_1'],
      eventOfficials: [],
      pendingInvites: [],
    }, 'host_1');

    expect(result.emailCandidates).toEqual([
      expect.objectContaining({ id: 'invite_1', type: 'STAFF', status: 'PENDING' }),
    ]);
    expect(state.invites[0].type).toBe('STAFF');
    expect(client.invites.create).not.toHaveBeenCalled();
  });

  it('rejects unknown explicit staff user ids before writing assignments', async () => {
    const state = createState();
    const client = makeClient(state);
    const initial = await loadEventStaffSnapshot(client, 'event_1');

    await expect(reconcileEventStaffDesiredState(client, 'event_1', {
      contractVersion: 1,
      expectedRevision: initial.revision,
      assistantHostIds: ['missing_user'],
      eventOfficials: [],
      pendingInvites: [],
    }, 'host_1')).rejects.toThrow('Unknown event staff user: missing_user');

    expect(client.events.update).not.toHaveBeenCalled();
    expect(client.invites.create).not.toHaveBeenCalled();
  });

  it('keeps terminal history separate while re-inviting a removed staff member', async () => {
    const state = createState();
    state.invites = [invite({ id: 'accepted_history', status: 'ACCEPTED', sentAt: new Date() })];
    const client = makeClient(state);
    const initial = await loadEventStaffSnapshot(client, 'event_1');

    const result = await reconcileEventStaffDesiredState(client, 'event_1', {
      contractVersion: 1,
      expectedRevision: initial.revision,
      assistantHostIds: ['assistant_1'],
      eventOfficials: [],
      pendingInvites: [],
    }, 'host_1');

    expect(state.invites).toHaveLength(2);
    expect(state.invites.map((row) => row.id)).toContain('accepted_history');
    expect(result.emailCandidates).toHaveLength(1);
    expect(result.emailCandidates[0].id).not.toBe('accepted_history');
  });

  it('keeps the operational pending row when terminal history sorts first by id', async () => {
    const state = createState();
    state.event.assistantHostIds = ['assistant_1'];
    state.invites = [
      invite({ id: 'aaa_history', status: 'ACCEPTED', sentAt: new Date('2026-01-01T00:00:00.000Z') }),
      invite({ id: 'zzz_pending', status: 'PENDING', sentAt: new Date('2026-02-01T00:00:00.000Z') }),
    ];
    const client = makeClient(state);
    const initial = await loadEventStaffSnapshot(client, 'event_1');

    const result = await reconcileEventStaffDesiredState(client, 'event_1', {
      contractVersion: 1,
      expectedRevision: initial.revision,
      assistantHostIds: ['assistant_1'],
      eventOfficials: [],
      pendingInvites: [],
    }, 'host_1');

    expect(state.invites.map((row) => row.id).sort()).toEqual(['aaa_history', 'zzz_pending']);
    expect(result.emailCandidates).toEqual([]);
  });

  it('normalizes legacy staff invite types and status aliases in the canonical snapshot', async () => {
    const state = createState();
    state.invites = [
      invite({ type: 'HOST', staffTypes: [], status: 'SENT', sentAt: new Date() }),
      invite({
        id: 'legacy_official',
        type: 'OFFICIAL',
        userId: 'official_1',
        email: 'official@example.com',
        staffTypes: [],
        status: 'REJECTED',
      }),
      invite({ id: 'event_non_staff', type: 'EVENT', staffTypes: [] }),
    ];

    const snapshot = await loadEventStaffSnapshot(makeClient(state), 'event_1');

    expect(snapshot.staffInvites).toEqual([
      expect.objectContaining({ id: 'invite_1', type: 'STAFF', status: 'PENDING', staffTypes: ['HOST'] }),
      expect.objectContaining({ id: 'legacy_official', type: 'STAFF', status: 'DECLINED', staffTypes: ['OFFICIAL'] }),
    ]);
  });

  it('removes obsolete retryable invites but retains non-retryable history', async () => {
    const state = createState();
    state.event.assistantHostIds = ['assistant_1'];
    state.invites = [
      invite({ id: 'pending_invite' }),
      invite({ id: 'history_invite', status: 'ACCEPTED' }),
    ];
    const client = makeClient(state);
    const initial = await loadEventStaffSnapshot(client, 'event_1');

    await reconcileEventStaffDesiredState(client, 'event_1', {
      contractVersion: 1,
      expectedRevision: initial.revision,
      assistantHostIds: [],
      eventOfficials: [],
      pendingInvites: [],
    }, 'host_1');

    expect(state.event.assistantHostIds).toEqual([]);
    expect(state.invites.map((row) => row.id)).toEqual(['history_invite']);
  });

  it('keeps committed state unchanged when a later official write fails inside the transaction', async () => {
    const committed = createState();
    const initial = await loadEventStaffSnapshot(makeClient(committed), 'event_1');
    const before = cloneState(committed);

    await expect((async () => {
      const transactionDraft = cloneState(committed);
      const client = makeClient(transactionDraft, { failOfficialUpsert: true });
      await reconcileEventStaffDesiredState(client, 'event_1', {
        contractVersion: 1,
        expectedRevision: initial.revision,
        assistantHostIds: ['assistant_1'],
        eventOfficials: [{
          userId: 'official_1',
          positionIds: ['position_1'],
          fieldIds: ['field_1'],
          isActive: true,
        }],
        pendingInvites: [],
      }, 'host_1');
      Object.assign(committed, transactionDraft);
    })()).rejects.toThrow('injected official write failure');

    expect(committed).toEqual(before);
  });

  it('keeps committed state unchanged when invite creation fails after assignment writes', async () => {
    const committed = createState();
    const initial = await loadEventStaffSnapshot(makeClient(committed), 'event_1');
    const before = cloneState(committed);

    await expect((async () => {
      const transactionDraft = cloneState(committed);
      const client = makeClient(transactionDraft, { failInviteCreate: true });
      await reconcileEventStaffDesiredState(client, 'event_1', {
        contractVersion: 1,
        expectedRevision: initial.revision,
        assistantHostIds: ['assistant_1'],
        eventOfficials: [],
        pendingInvites: [],
      }, 'host_1');
      Object.assign(committed, transactionDraft);
    })()).rejects.toThrow('injected invite write failure');

    expect(committed).toEqual(before);
  });
});
