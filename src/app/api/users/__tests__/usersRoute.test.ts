/** @jest-environment node */

import { NextRequest } from 'next/server';

const findManyMock = jest.fn();
const sensitiveUserDataFindManyMock = jest.fn();
const authUserFindManyMock = jest.fn();
const parentChildLinksFindManyMock = jest.fn();
const teamsFindManyMock = jest.fn();
const teamsFindUniqueMock = jest.fn();
const eventsFindUniqueMock = jest.fn();
const eventRegistrationsFindManyMock = jest.fn();
const staffMembersFindManyMock = jest.fn();
const organizationsFindManyMock = jest.fn();
const organizationsFindUniqueMock = jest.fn();
const organizationsFindFirstMock = jest.fn();
const canonicalTeamsFindManyMock = jest.fn();
const canonicalTeamsFindUniqueMock = jest.fn();
const teamRegistrationsFindManyMock = jest.fn();
const teamStaffAssignmentsFindManyMock = jest.fn();
const getOptionalSessionMock = jest.fn();
const requireSessionMock = jest.fn();
const prismaMock = {
  userData: {
    findMany: (...args: any[]) => findManyMock(...args),
  },
  sensitiveUserData: {
    findMany: (...args: any[]) => sensitiveUserDataFindManyMock(...args),
  },
  authUser: {
    findMany: (...args: any[]) => authUserFindManyMock(...args),
  },
  parentChildLinks: {
    findMany: (...args: any[]) => parentChildLinksFindManyMock(...args),
  },
  teams: {
    findMany: (...args: any[]) => teamsFindManyMock(...args),
    findUnique: (...args: any[]) => teamsFindUniqueMock(...args),
  },
  events: {
    findUnique: (...args: any[]) => eventsFindUniqueMock(...args),
  },
  eventRegistrations: {
    findMany: (...args: any[]) => eventRegistrationsFindManyMock(...args),
  },
  staffMembers: {
    findMany: (...args: any[]) => staffMembersFindManyMock(...args),
  },
  organizations: {
    findMany: (...args: any[]) => organizationsFindManyMock(...args),
    findUnique: (...args: any[]) => organizationsFindUniqueMock(...args),
    findFirst: (...args: any[]) => organizationsFindFirstMock(...args),
  },
  canonicalTeams: {
    findMany: (...args: any[]) => canonicalTeamsFindManyMock(...args),
    findUnique: (...args: any[]) => canonicalTeamsFindUniqueMock(...args),
  },
  teamRegistrations: {
    findMany: (...args: any[]) => teamRegistrationsFindManyMock(...args),
  },
  teamStaffAssignments: {
    findMany: (...args: any[]) => teamStaffAssignmentsFindManyMock(...args),
  },
};

const withLegacyListMock = jest.fn((rows: any[]) => rows.map((row) => ({ ...row, $id: row.id })));

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({
  getOptionalSession: (...args: any[]) => getOptionalSessionMock(...args),
  requireSession: (...args: any[]) => requireSessionMock(...args),
}));
jest.mock('@/server/legacyFormat', () => ({
  withLegacyFields: (row: any) => ({ ...row, $id: row.id }),
  withLegacyList: (rows: any[]) => withLegacyListMock(rows),
}));

import { GET as usersGet, POST as usersPost } from '@/app/api/users/route';

describe('users list route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getOptionalSessionMock.mockReturnValue(null);
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    sensitiveUserDataFindManyMock.mockResolvedValue([]);
    authUserFindManyMock.mockResolvedValue([]);
    parentChildLinksFindManyMock.mockResolvedValue([]);
    teamsFindManyMock.mockResolvedValue([]);
    teamsFindUniqueMock.mockResolvedValue(null);
    eventsFindUniqueMock.mockResolvedValue(null);
    eventRegistrationsFindManyMock.mockResolvedValue([]);
    staffMembersFindManyMock.mockResolvedValue([]);
    organizationsFindManyMock.mockResolvedValue([]);
    organizationsFindUniqueMock.mockResolvedValue(null);
    organizationsFindFirstMock.mockResolvedValue(null);
    canonicalTeamsFindManyMock.mockResolvedValue([]);
    canonicalTeamsFindUniqueMock.mockResolvedValue(null);
    teamRegistrationsFindManyMock.mockResolvedValue([]);
    teamStaffAssignmentsFindManyMock.mockResolvedValue([]);
  });

  it('rejects the removed universal profile mutation endpoint', async () => {
    const res = await usersPost(new NextRequest('http://localhost/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'victim_1', data: { friendIds: ['attacker_1'] } }),
    }));

    expect(res.status).toBe(410);
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it('returns users by ids in requested order', async () => {
    findManyMock.mockResolvedValue([
      { id: 'user_2', userName: 'user2', dateOfBirth: new Date('2000-01-01'), teamIds: ['legacy_only'] },
      { id: 'user_1', userName: 'user1', dateOfBirth: new Date('2000-01-01'), teamIds: ['legacy_only'] },
    ]);
    teamRegistrationsFindManyMock.mockResolvedValue([
      { userId: 'user_2', teamId: 'team_b' },
      { userId: 'user_1', teamId: 'team_a' },
    ]);

    const res = await usersGet(new NextRequest('http://localhost/api/users?ids=user_1,user_2,user_1'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(findManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: ['user_1', 'user_2'] } },
      take: 2,
    }));
    expect(json.users.map((user: any) => user.$id)).toEqual(['user_1', 'user_2']);
    expect(json.users.map((user: any) => user.teamIds)).toEqual([['team_a'], ['team_b']]);
  });

  it('supports search query mode when ids are not provided', async () => {
    findManyMock.mockResolvedValue([{
      id: 'user_3',
      userName: 'player_three',
      firstName: 'Player',
      lastName: 'Three',
      dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
    }]);

    const res = await usersGet(new NextRequest('http://localhost/api/users?query=player'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(findManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ OR: expect.any(Array) }),
      take: 100,
    }));
    expect(json.users).toHaveLength(1);
  });

  it('filters @test.com email accounts from search results', async () => {
    findManyMock.mockResolvedValue([
      {
        id: 'user_visible',
        userName: 'visible_user',
        firstName: 'Visible',
        lastName: 'User',
        dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
      },
      {
        id: 'user_sensitive_test',
        userName: 'sensitive_test',
        firstName: 'Sensitive',
        lastName: 'Test',
        dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
      },
      {
        id: 'user_auth_test',
        userName: 'auth_test',
        firstName: 'Auth',
        lastName: 'Test',
        dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
      },
    ]);
    sensitiveUserDataFindManyMock.mockResolvedValue([
      { userId: 'user_visible', email: 'visible@example.org' },
      { userId: 'user_sensitive_test', email: 'Hidden@Test.com' },
    ]);
    authUserFindManyMock.mockResolvedValue([
      { id: 'user_auth_test', email: 'auth@test.com' },
    ]);

    const res = await usersGet(new NextRequest('http://localhost/api/users?query=test'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(sensitiveUserDataFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: { in: ['user_visible', 'user_sensitive_test', 'user_auth_test'] } },
      select: { userId: true, email: true },
    }));
    expect(authUserFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: ['user_visible', 'user_sensitive_test', 'user_auth_test'] } },
      select: { id: true, email: true },
    }));
    expect(json.users.map((user: any) => user.$id)).toEqual(['user_visible']);
  });

  it('filters private-to-organization accounts from outsider search', async () => {
    findManyMock.mockResolvedValue([
      {
        id: 'user_public',
        userName: 'public_user',
        firstName: 'Public',
        lastName: 'User',
        dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
        accountVisibility: 'PUBLIC',
      },
      {
        id: 'user_private',
        userName: 'private_user',
        firstName: 'Private',
        lastName: 'User',
        dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
        accountVisibility: 'PRIVATE_TO_ORGS',
      },
    ]);

    const res = await usersGet(new NextRequest('http://localhost/api/users?query=user'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.users.map((user: any) => user.$id)).toEqual(['user_public']);
  });

  it('shows private-to-organization accounts to viewers from the same organization', async () => {
    getOptionalSessionMock.mockReturnValue({ userId: 'viewer_1', isAdmin: false, rawToken: 'token' });
    staffMembersFindManyMock
      .mockResolvedValueOnce([{ organizationId: 'org_1' }])
      .mockResolvedValueOnce([{ userId: 'viewer_1' }, { userId: 'user_private' }]);
    organizationsFindManyMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ownerId: 'owner_1' }]);
    findManyMock.mockResolvedValue([
      {
        id: 'user_private',
        userName: 'private_user',
        firstName: 'Private',
        lastName: 'User',
        dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
        accountVisibility: 'PRIVATE_TO_ORGS',
      },
    ]);

    const res = await usersGet(new NextRequest('http://localhost/api/users?query=private'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(staffMembersFindManyMock).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: { organizationId: { in: ['org_1'] } },
      select: { userId: true },
    }));
    expect(json.users.map((user: any) => user.$id)).toEqual(['user_private']);
  });

  it('returns an empty list for invalid search payload', async () => {
    const res = await usersGet(new NextRequest('http://localhost/api/users'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(findManyMock).not.toHaveBeenCalled();
    expect(json.users).toEqual([]);
  });

  it('shows minor identity to the event host when scoped to their event', async () => {
    getOptionalSessionMock.mockReturnValue({ userId: 'host_1', isAdmin: false, rawToken: 'token' });
    eventsFindUniqueMock.mockResolvedValue({
      hostId: 'host_1',
      teamIds: ['team_1'],
      userIds: ['minor_1'],
      freeAgentIds: [],
    });
    eventRegistrationsFindManyMock.mockResolvedValue([
      { registrantId: 'team_1', registrantType: 'TEAM', rosterRole: 'PARTICIPANT' },
    ]);
    teamsFindManyMock.mockResolvedValue([
      {
        id: 'team_1',
        captainId: 'capt_1',
        managerId: 'mgr_1',
        headCoachId: null,
        coachIds: [],
        playerIds: ['minor_1'],
        pending: [],
      },
    ]);
    findManyMock.mockResolvedValue([
      {
        id: 'minor_1',
        firstName: 'Minor',
        lastName: 'Player',
        userName: 'minor_player',
        dateOfBirth: new Date('2012-01-01T00:00:00.000Z'),
      },
    ]);

    const res = await usersGet(new NextRequest('http://localhost/api/users?ids=minor_1&eventId=event_1'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(eventsFindUniqueMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'event_1' },
    }));
    expect(json.users).toHaveLength(1);
    expect(json.users[0].displayName).toBe('Minor Player');
    expect(json.users[0].isIdentityHidden).toBe(false);
  });

  it('limits parent event visibility to their child team and keeps other minors hidden', async () => {
    getOptionalSessionMock.mockReturnValue({ userId: 'parent_1', isAdmin: false, rawToken: 'token' });
    parentChildLinksFindManyMock.mockResolvedValue([{ childId: 'child_1' }]);
    eventsFindUniqueMock.mockResolvedValue({
      hostId: 'host_1',
      organizationId: null,
      teamIds: ['team_1', 'team_2'],
      userIds: [],
      freeAgentIds: ['minor_free_1'],
    });
    eventRegistrationsFindManyMock.mockResolvedValue([
      { registrantId: 'team_1', registrantType: 'TEAM', rosterRole: 'PARTICIPANT' },
      { registrantId: 'team_2', registrantType: 'TEAM', rosterRole: 'PARTICIPANT' },
      { registrantId: 'minor_free_1', registrantType: 'USER', rosterRole: 'FREE_AGENT' },
    ]);
    teamsFindManyMock
      .mockResolvedValueOnce([{ id: 'team_1' }])
      .mockResolvedValueOnce([
        {
          id: 'team_1',
          captainId: 'capt_1',
          managerId: 'mgr_1',
          headCoachId: null,
          coachIds: [],
          playerIds: ['child_1', 'minor_team_1'],
          pending: [],
        },
        {
          id: 'team_2',
          captainId: 'capt_2',
          managerId: 'mgr_2',
          headCoachId: null,
          coachIds: [],
          playerIds: ['minor_team_2'],
          pending: [],
        },
      ]);
    findManyMock.mockResolvedValue([
      {
        id: 'minor_team_1',
        firstName: 'Minor',
        lastName: 'One',
        userName: 'minor_one',
        dateOfBirth: new Date('2012-01-01T00:00:00.000Z'),
      },
      {
        id: 'minor_team_2',
        firstName: 'Minor',
        lastName: 'Two',
        userName: 'minor_two',
        dateOfBirth: new Date('2012-02-01T00:00:00.000Z'),
      },
      {
        id: 'minor_free_1',
        firstName: 'Minor',
        lastName: 'Free',
        userName: 'minor_free',
        dateOfBirth: new Date('2012-03-01T00:00:00.000Z'),
      },
    ]);

    const res = await usersGet(
      new NextRequest('http://localhost/api/users?ids=minor_team_1,minor_team_2,minor_free_1&eventId=event_1'),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.users).toHaveLength(3);
    expect(json.users[0].displayName).toBe('Minor One');
    expect(json.users[0].isIdentityHidden).toBe(false);
    expect(json.users[1].displayName).toBe('Minor participant');
    expect(json.users[1].isIdentityHidden).toBe(true);
    expect(json.users[2].displayName).toBe('Minor participant');
    expect(json.users[2].isIdentityHidden).toBe(true);
    expect(json.users.map((user: any) => user.isMinor)).toEqual([true, true, true]);
  });

  it('limits event-scoped team member visibility to their own team members', async () => {
    getOptionalSessionMock.mockReturnValue({ userId: 'player_1', isAdmin: false, rawToken: 'token' });
    eventsFindUniqueMock.mockResolvedValue({
      hostId: 'host_1',
      organizationId: null,
      teamIds: ['team_1', 'team_2'],
      userIds: [],
      freeAgentIds: ['minor_free_1'],
    });
    eventRegistrationsFindManyMock.mockResolvedValue([
      { registrantId: 'team_1', registrantType: 'TEAM', rosterRole: 'PARTICIPANT' },
      { registrantId: 'team_2', registrantType: 'TEAM', rosterRole: 'PARTICIPANT' },
      { registrantId: 'minor_free_1', registrantType: 'USER', rosterRole: 'FREE_AGENT' },
    ]);
    teamsFindManyMock.mockResolvedValue([
      {
        id: 'team_1',
        captainId: 'capt_1',
        managerId: 'mgr_1',
        headCoachId: null,
        coachIds: [],
        playerIds: ['player_1', 'minor_team_1'],
        pending: [],
      },
      {
        id: 'team_2',
        captainId: 'capt_2',
        managerId: 'mgr_2',
        headCoachId: null,
        coachIds: [],
        playerIds: ['minor_team_2'],
        pending: [],
      },
    ]);
    findManyMock.mockResolvedValue([
      {
        id: 'minor_team_1',
        firstName: 'Minor',
        lastName: 'One',
        userName: 'minor_one',
        dateOfBirth: new Date('2012-01-01T00:00:00.000Z'),
      },
      {
        id: 'minor_team_2',
        firstName: 'Minor',
        lastName: 'Two',
        userName: 'minor_two',
        dateOfBirth: new Date('2012-02-01T00:00:00.000Z'),
      },
      {
        id: 'minor_free_1',
        firstName: 'Minor',
        lastName: 'Free',
        userName: 'minor_free',
        dateOfBirth: new Date('2012-03-01T00:00:00.000Z'),
      },
    ]);

    const res = await usersGet(
      new NextRequest('http://localhost/api/users?ids=minor_team_1,minor_team_2,minor_free_1&eventId=event_1'),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.users).toHaveLength(3);
    expect(json.users[0].displayName).toBe('Minor One');
    expect(json.users[0].isIdentityHidden).toBe(false);
    expect(json.users[1].displayName).toBe('Minor participant');
    expect(json.users[1].isIdentityHidden).toBe(true);
    expect(json.users[2].displayName).toBe('Minor participant');
    expect(json.users[2].isIdentityHidden).toBe(true);
    expect(json.users.map((user: any) => user.isMinor)).toEqual([true, true, true]);
  });

  it('shows minor identity to team manager when scoped to their team', async () => {
    getOptionalSessionMock.mockReturnValue({ userId: 'mgr_1', isAdmin: false, rawToken: 'token' });
    teamsFindUniqueMock.mockResolvedValue({
      id: 'team_1',
      captainId: 'capt_1',
      managerId: 'mgr_1',
      headCoachId: 'coach_1',
      coachIds: ['asst_1'],
      playerIds: ['minor_1'],
      pending: [],
    });
    findManyMock.mockResolvedValue([
      {
        id: 'minor_1',
        firstName: 'Minor',
        lastName: 'Player',
        userName: 'minor_player',
        dateOfBirth: new Date('2012-01-01T00:00:00.000Z'),
      },
    ]);

    const res = await usersGet(new NextRequest('http://localhost/api/users?ids=minor_1&teamId=team_1'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(teamsFindUniqueMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'team_1' },
    }));
    expect(json.users).toHaveLength(1);
    expect(json.users[0].displayName).toBe('Minor Player');
    expect(json.users[0].isIdentityHidden).toBe(false);
  });

  it('shows minor identity to team player when scoped to their team', async () => {
    getOptionalSessionMock.mockReturnValue({ userId: 'player_1', isAdmin: false, rawToken: 'token' });
    teamsFindUniqueMock.mockResolvedValue({
      id: 'team_1',
      captainId: 'capt_1',
      managerId: 'mgr_1',
      headCoachId: 'coach_1',
      coachIds: ['asst_1'],
      playerIds: ['player_1', 'minor_1'],
      pending: [],
    });
    findManyMock.mockResolvedValue([
      {
        id: 'minor_1',
        firstName: 'Minor',
        lastName: 'Player',
        userName: 'minor_player',
        dateOfBirth: new Date('2012-01-01T00:00:00.000Z'),
      },
    ]);

    const res = await usersGet(new NextRequest('http://localhost/api/users?ids=minor_1&teamId=team_1'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.users).toHaveLength(1);
    expect(json.users[0].displayName).toBe('Minor Player');
    expect(json.users[0].isIdentityHidden).toBe(false);
  });

  it('shows minor identity to org staff when scoped to a team in their organization', async () => {
    getOptionalSessionMock.mockReturnValue({ userId: 'staff_1', isAdmin: false, rawToken: 'token' });
    teamsFindUniqueMock.mockResolvedValue({
      id: 'team_1',
      captainId: 'capt_1',
      managerId: 'mgr_1',
      headCoachId: null,
      coachIds: [],
      playerIds: ['minor_1'],
      pending: [],
    });
    organizationsFindFirstMock.mockResolvedValue({ id: 'org_1' });
    staffMembersFindManyMock.mockResolvedValue([{ organizationId: 'org_1' }]);
    canonicalTeamsFindUniqueMock.mockResolvedValue({ organizationId: 'org_1' });
    canonicalTeamsFindManyMock.mockResolvedValue([{ id: 'team_1' }]);
    teamRegistrationsFindManyMock.mockResolvedValue([{ teamId: 'team_1', userId: 'minor_1', status: 'ACTIVE' }]);
    findManyMock.mockResolvedValue([
      {
        id: 'minor_1',
        firstName: 'Minor',
        lastName: 'Player',
        userName: 'minor_player',
        dateOfBirth: new Date('2012-01-01T00:00:00.000Z'),
      },
    ]);

    const res = await usersGet(new NextRequest('http://localhost/api/users?ids=minor_1&teamId=team_1'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.users).toHaveLength(1);
    expect(json.users[0].displayName).toBe('Minor Player');
    expect(json.users[0].isIdentityHidden).toBe(false);
  });

  it('shows minor identity to org owner when scoped to a team in their organization', async () => {
    getOptionalSessionMock.mockReturnValue({ userId: 'owner_1', isAdmin: false, rawToken: 'token' });
    teamsFindUniqueMock.mockResolvedValue({
      id: 'team_1',
      captainId: 'capt_1',
      managerId: 'mgr_1',
      headCoachId: null,
      coachIds: [],
      playerIds: ['minor_1'],
      pending: [],
    });
    organizationsFindFirstMock.mockResolvedValue({ id: 'org_1' });
    organizationsFindManyMock.mockResolvedValue([{ id: 'org_1' }]);
    canonicalTeamsFindUniqueMock.mockResolvedValue({ organizationId: 'org_1' });
    canonicalTeamsFindManyMock.mockResolvedValue([{ id: 'team_1' }]);
    teamRegistrationsFindManyMock.mockResolvedValue([{ teamId: 'team_1', userId: 'minor_1', status: 'ACTIVE' }]);
    findManyMock.mockResolvedValue([
      {
        id: 'minor_1',
        firstName: 'Minor',
        lastName: 'Player',
        userName: 'minor_player',
        dateOfBirth: new Date('2012-01-01T00:00:00.000Z'),
      },
    ]);

    const res = await usersGet(new NextRequest('http://localhost/api/users?ids=minor_1&teamId=team_1'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.users).toHaveLength(1);
    expect(json.users[0].displayName).toBe('Minor Player');
    expect(json.users[0].isIdentityHidden).toBe(false);
  });

  it('hides an unrelated minor and never returns exact DOB or social metadata publicly', async () => {
    findManyMock.mockResolvedValue([{
      id: 'minor_1',
      firstName: 'Private',
      lastName: 'Minor',
      userName: 'private_minor',
      dateOfBirth: new Date('2012-01-01T00:00:00.000Z'),
      dobVerified: true,
      dobVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
      ageVerificationProvider: 'provider',
      teamIds: ['team_1'],
      friendIds: ['friend_1'],
      followingIds: ['follow_1'],
      friendRequestIds: ['request_1'],
      friendRequestSentIds: ['sent_1'],
      uploadedImages: ['image_1'],
      hasStripeAccount: true,
      homePageOrganizationId: 'org_1',
      profileImageId: 'profile_1',
      accountVisibility: 'PUBLIC',
    }]);

    const res = await usersGet(new NextRequest('http://localhost/api/users?ids=minor_1'));
    const [user] = (await res.json()).users;

    expect(user).toEqual(expect.objectContaining({
      displayName: 'Minor participant',
      isIdentityHidden: true,
      dateOfBirth: null,
      dobVerified: false,
      dobVerifiedAt: null,
      ageVerificationProvider: null,
      friendIds: [],
      followingIds: [],
      friendRequestIds: [],
      friendRequestSentIds: [],
      uploadedImages: [],
      hasStripeAccount: false,
      homePageOrganizationId: null,
      profileImageId: null,
    }));
  });

  it('hides an unrelated adult\'s DOB and social metadata while preserving their public identity', async () => {
    findManyMock.mockResolvedValue([{
      id: 'adult_1',
      firstName: 'Public',
      lastName: 'Adult',
      userName: 'public_adult',
      dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
      dobVerified: true,
      dobVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
      ageVerificationProvider: 'provider',
      teamIds: ['team_1'],
      friendIds: ['friend_1'],
      followingIds: ['follow_1'],
      friendRequestIds: ['request_1'],
      friendRequestSentIds: ['sent_1'],
      uploadedImages: ['image_1'],
      hasStripeAccount: true,
      homePageOrganizationId: 'org_1',
      profileImageId: 'profile_1',
      accountVisibility: 'PUBLIC',
    }]);

    const res = await usersGet(new NextRequest('http://localhost/api/users?ids=adult_1'));
    const [user] = (await res.json()).users;

    expect(user).toEqual(expect.objectContaining({
      displayName: 'Public Adult',
      isMinor: false,
      isIdentityHidden: false,
      dateOfBirth: null,
      dobVerified: false,
      dobVerifiedAt: null,
      ageVerificationProvider: null,
      friendIds: [],
      followingIds: [],
      friendRequestIds: [],
      friendRequestSentIds: [],
      uploadedImages: [],
      hasStripeAccount: false,
      homePageOrganizationId: null,
    }));
  });
});
