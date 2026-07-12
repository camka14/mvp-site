import { canManageScheduledFields, canManageTimeSlot } from '@/server/timeSlotAccess';

const canManageOrganizationMock = jest.fn();
const canManageEventMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: {} }));
jest.mock('@/server/accessControl', () => ({
  canManageOrganization: (...args: unknown[]) => canManageOrganizationMock(...args),
  canManageEvent: (...args: unknown[]) => canManageEventMock(...args),
}));

const client = {
  fields: { findMany: jest.fn() },
  facilities: { findMany: jest.fn() },
  organizations: { findUnique: jest.fn() },
  events: { findMany: jest.fn() },
};

const session = (userId: string, isAdmin = false) => ({ userId, isAdmin, sessionVersion: 1 });

describe('time-slot access', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    client.fields.findMany.mockResolvedValue([]);
    client.facilities.findMany.mockResolvedValue([]);
    client.organizations.findUnique.mockResolvedValue(null);
    client.events.findMany.mockResolvedValue([]);
    canManageOrganizationMock.mockResolvedValue(false);
    canManageEventMock.mockResolvedValue(false);
  });

  it('allows a standalone field only to its recorded creator', async () => {
    client.fields.findMany.mockResolvedValueOnce([
      { id: 'field_1', organizationId: null, facilityId: null, createdBy: 'creator_1' },
    ]);

    await expect(canManageScheduledFields(session('creator_1'), ['field_1'], client as any)).resolves.toBe(true);

    client.fields.findMany.mockResolvedValueOnce([
      { id: 'field_1', organizationId: null, facilityId: null, createdBy: 'creator_1' },
    ]);
    await expect(canManageScheduledFields(session('unrelated_1'), ['field_1'], client as any)).resolves.toBe(false);
  });

  it('uses the field organization rather than an old field creator for organization inventory', async () => {
    client.fields.findMany.mockResolvedValueOnce([
      { id: 'field_1', organizationId: 'org_1', facilityId: null, createdBy: 'former_staff_1' },
    ]);
    client.organizations.findUnique.mockResolvedValueOnce({ id: 'org_1', ownerId: 'owner_1' });
    canManageOrganizationMock.mockResolvedValueOnce(true);

    await expect(canManageScheduledFields(session('manager_1'), ['field_1'], client as any)).resolves.toBe(true);
    expect(canManageOrganizationMock).toHaveBeenCalledWith(
      session('manager_1'),
      { id: 'org_1', ownerId: 'owner_1' },
      client,
    );
  });

  it('uses a linked facility organization when a field does not duplicate its organization ID', async () => {
    client.fields.findMany.mockResolvedValueOnce([
      { id: 'field_1', organizationId: null, facilityId: 'facility_1', createdBy: 'former_staff_1' },
    ]);
    client.facilities.findMany.mockResolvedValueOnce([{ id: 'facility_1', organizationId: 'org_1' }]);
    client.organizations.findUnique.mockResolvedValueOnce({ id: 'org_1', ownerId: 'owner_1' });
    canManageOrganizationMock.mockResolvedValueOnce(true);

    await expect(canManageScheduledFields(session('manager_1'), ['field_1'], client as any)).resolves.toBe(true);
  });

  it('denies field access when a requested field is missing or archived', async () => {
    client.fields.findMany.mockResolvedValueOnce([]);

    await expect(canManageScheduledFields(session('manager_1'), ['missing_field'], client as any)).resolves.toBe(false);
  });

  it('uses every linked event as the authority for legacy field-less slots', async () => {
    client.events.findMany.mockResolvedValueOnce([
      { id: 'event_1', hostId: 'host_1', assistantHostIds: [], organizationId: null },
      { id: 'event_2', hostId: 'host_2', assistantHostIds: [], organizationId: null },
    ]);
    canManageEventMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await expect(canManageTimeSlot(session('host_1'), {
      id: 'slot_1',
      scheduledFieldId: null,
      scheduledFieldIds: [],
    }, client as any)).resolves.toBe(false);
  });

  it('allows administrators without querying linked records', async () => {
    await expect(canManageTimeSlot(session('admin_1', true), {
      id: 'slot_1',
      scheduledFieldId: null,
      scheduledFieldIds: [],
    }, client as any)).resolves.toBe(true);
    expect(client.events.findMany).not.toHaveBeenCalled();
    expect(client.fields.findMany).not.toHaveBeenCalled();
  });
});
