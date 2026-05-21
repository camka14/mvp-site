import {
  collectOrganizationHostIds,
  collectOrganizationOfficialIds,
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

  it('collects host and official ids from active staff memberships', () => {
    const organization = {
      ownerId: 'owner_1',
      staffMembers: [
        { organizationId: 'org_1', userId: 'host_1', types: ['HOST'] },
        { organizationId: 'org_1', userId: 'host_2', types: ['HOST'] },
        { organizationId: 'org_1', userId: 'official_1', types: ['OFFICIAL'] },
        { organizationId: 'org_1', userId: 'pending_official', types: ['OFFICIAL'] },
      ],
      staffInvites: [
        { organizationId: 'org_1', userId: 'pending_official', type: 'STAFF', status: 'PENDING' },
      ],
    };

    expect(collectOrganizationHostIds(organization)).toEqual(['owner_1', 'host_1', 'host_2']);
    expect(collectOrganizationOfficialIds(organization)).toEqual(['official_1']);
  });

  it('sanitizes assignments for organization events', () => {
    const organization = {
      ownerId: 'owner_1',
      staffMembers: [
        { organizationId: 'org_1', userId: 'host_1', types: ['HOST'] },
        { organizationId: 'org_1', userId: 'host_2', types: ['HOST'] },
        { organizationId: 'org_1', userId: 'official_1', types: ['OFFICIAL'] },
        { organizationId: 'org_1', userId: 'official_2', types: ['OFFICIAL'] },
      ],
      staffInvites: [],
    };

    const sanitized = sanitizeOrganizationEventAssignments(
      {
        hostId: 'outside_host',
        assistantHostIds: ['host_2', 'outside_assistant', 'owner_1'],
        officialIds: ['official_2', 'outside_official'],
      },
      organization,
    );

    expect(sanitized.hostId).toBe('owner_1');
    expect(sanitized.assistantHostIds).toEqual(['host_2']);
    expect(sanitized.officialIds).toEqual(['official_2']);
  });

  it('keeps non-organization host assignments when no host constraints are provided', () => {
    const sanitized = sanitizeOrganizationEventAssignments(
      {
        hostId: 'host_1',
        assistantHostIds: ['assistant_1'],
        officialIds: ['official_1'],
      },
      null,
    );

    expect(sanitized.hostId).toBe('host_1');
    expect(sanitized.assistantHostIds).toEqual(['assistant_1']);
    expect(sanitized.officialIds).toEqual([]);
  });
});



