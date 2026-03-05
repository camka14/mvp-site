import {
  collectOrganizationHostIds,
  collectOrganizationRefereeIds,
  normalizeEntityId,
  normalizeUniqueIds,
  sanitizeOrganizationEventAssignments,
} from '@/lib/organizationEventAccess';

describe('organizationEventAccess helpers', () => {
  it('normalizes ids and removes duplicates', () => {
    expect(normalizeEntityId('  user_1  ')).toBe('user_1');
    expect(normalizeEntityId('   ')).toBeNull();
    expect(normalizeUniqueIds(['user_1', ' user_1 ', '', 'user_2'])).toEqual(['user_1', 'user_2']);
  });

  it('collects host and referee ids from organization metadata', () => {
    const organization = {
      ownerId: 'owner_1',
      hostIds: ['host_1', 'host_2'],
      refIds: ['ref_1'],
      referees: [{ $id: 'ref_2' }, { $id: 'ref_1' }],
    };

    expect(collectOrganizationHostIds(organization)).toEqual(['owner_1', 'host_1', 'host_2']);
    expect(collectOrganizationRefereeIds(organization)).toEqual(['ref_1', 'ref_2']);
  });

  it('sanitizes assignments for organization events', () => {
    const organization = {
      ownerId: 'owner_1',
      hostIds: ['host_1', 'host_2'],
      refIds: ['ref_1', 'ref_2'],
    };

    const sanitized = sanitizeOrganizationEventAssignments(
      {
        hostId: 'outside_host',
        assistantHostIds: ['host_2', 'outside_assistant', 'owner_1'],
        refereeIds: ['ref_2', 'outside_ref'],
      },
      organization,
    );

    expect(sanitized.hostId).toBe('owner_1');
    expect(sanitized.assistantHostIds).toEqual(['host_2']);
    expect(sanitized.refereeIds).toEqual(['ref_2']);
  });

  it('keeps non-organization host assignments when no host constraints are provided', () => {
    const sanitized = sanitizeOrganizationEventAssignments(
      {
        hostId: 'host_1',
        assistantHostIds: ['assistant_1'],
        refereeIds: ['ref_1'],
      },
      null,
    );

    expect(sanitized.hostId).toBe('host_1');
    expect(sanitized.assistantHostIds).toEqual(['assistant_1']);
    expect(sanitized.refereeIds).toEqual([]);
  });
});

