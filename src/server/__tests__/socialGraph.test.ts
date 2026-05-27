/** @jest-environment node */

const users = new Map<string, any>();

const cloneUser = (user: any) => ({
  ...user,
  teamIds: [...(user.teamIds ?? [])],
  friendIds: [...(user.friendIds ?? [])],
  followingIds: [...(user.followingIds ?? [])],
  friendRequestIds: [...(user.friendRequestIds ?? [])],
  friendRequestSentIds: [...(user.friendRequestSentIds ?? [])],
  uploadedImages: [...(user.uploadedImages ?? [])],
});

const findMany = jest.fn(async (args: any) => {
  const all = Array.from(users.values());
  const where = args?.where ?? {};

  if (where.id?.in) {
    const ids = where.id.in as string[];
    return all.filter((user) => ids.includes(user.id)).map(cloneUser);
  }

  if (where.followingIds?.has) {
    const target = String(where.followingIds.has);
    return all.filter((user) => (user.followingIds ?? []).includes(target)).map(cloneUser);
  }

  return all.map(cloneUser);
});

const findUnique = jest.fn(async (args: any) => {
  const id = args?.where?.id;
  if (!id) return null;
  const row = users.get(String(id));
  return row ? cloneUser(row) : null;
});

const update = jest.fn(async (args: any) => {
  const id = args?.where?.id;
  const current = users.get(String(id));
  if (!current) throw new Error(`Missing user ${id}`);
  const next = {
    ...current,
    ...args.data,
  };
  users.set(String(id), next);
  return cloneUser(next);
});

const prismaMock: any = {
  userData: {
    findMany,
    findUnique,
    update,
  },
  $transaction: jest.fn(async (callback: (tx: any) => unknown): Promise<unknown> => callback(prismaMock)),
};

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import {
  acceptFriendRequest,
  followUser,
  getSocialGraphForUser,
  sendFriendRequest,
  unfollowUser,
} from '@/server/socialGraph';

const baseUser = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  createdAt: null,
  updatedAt: null,
  firstName: id,
  lastName: 'User',
  dateOfBirth: new Date('2000-01-01T00:00:00.000Z'),
  dobVerified: false,
  dobVerifiedAt: null,
  ageVerificationProvider: null,
  teamIds: [],
  friendIds: [],
  userName: id,
  hasStripeAccount: false,
  followingIds: [],
  friendRequestIds: [],
  friendRequestSentIds: [],
  uploadedImages: [],
  profileImageId: null,
  ...overrides,
});

describe('socialGraph', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    users.clear();
    users.set('user_1', baseUser('user_1'));
    users.set('user_2', baseUser('user_2'));
    users.set('user_3', baseUser('user_3'));
  });

  it('sends and accepts friend requests with symmetric updates', async () => {
    const sender = await sendFriendRequest('user_1', 'user_2');
    expect(sender.id).toBe('user_1');
    expect(users.get('user_1').friendRequestSentIds).toContain('user_2');
    expect(users.get('user_2').friendRequestIds).toContain('user_1');

    const accepter = await acceptFriendRequest('user_2', 'user_1');
    expect(accepter.id).toBe('user_2');

    expect(users.get('user_1').friendIds).toContain('user_2');
    expect(users.get('user_2').friendIds).toContain('user_1');
    expect(users.get('user_1').friendRequestSentIds).not.toContain('user_2');
    expect(users.get('user_2').friendRequestIds).not.toContain('user_1');
  });

  it('follows and unfollows users', async () => {
    await followUser('user_1', 'user_3');
    expect(users.get('user_1').followingIds).toContain('user_3');

    await unfollowUser('user_1', 'user_3');
    expect(users.get('user_1').followingIds).not.toContain('user_3');
  });

  it('rejects friend requests involving minor or placeholder-DOB accounts', async () => {
    users.set('minor_target', baseUser('minor_target', {
      dateOfBirth: new Date('2012-01-01T00:00:00.000Z'),
    }));
    users.set('unknown_dob_actor', baseUser('unknown_dob_actor', {
      dateOfBirth: new Date('1970-01-01T00:00:00.000Z'),
    }));

    await expect(sendFriendRequest('user_1', 'minor_target')).rejects.toMatchObject({
      status: 403,
    });
    await expect(sendFriendRequest('unknown_dob_actor', 'user_1')).rejects.toMatchObject({
      status: 403,
    });
    expect(users.get('user_1').friendRequestSentIds).not.toContain('minor_target');
    expect(users.get('minor_target').friendRequestIds).not.toContain('user_1');
  });

  it('rejects accepting friend requests involving minor accounts', async () => {
    users.set('minor_requester', baseUser('minor_requester', {
      dateOfBirth: new Date('2012-01-01T00:00:00.000Z'),
      friendRequestSentIds: ['user_1'],
    }));
    users.set('user_1', baseUser('user_1', {
      friendRequestIds: ['minor_requester'],
    }));

    await expect(acceptFriendRequest('user_1', 'minor_requester')).rejects.toMatchObject({
      status: 403,
    });
    expect(users.get('user_1').friendIds).not.toContain('minor_requester');
    expect(users.get('minor_requester').friendIds).not.toContain('user_1');
  });

  it('rejects follows involving minor or placeholder-DOB accounts', async () => {
    users.set('minor_target', baseUser('minor_target', {
      dateOfBirth: new Date('2012-01-01T00:00:00.000Z'),
    }));
    users.set('unknown_dob_actor', baseUser('unknown_dob_actor', {
      dateOfBirth: new Date('1970-01-01T00:00:00.000Z'),
    }));

    await expect(followUser('user_1', 'minor_target')).rejects.toMatchObject({
      status: 403,
    });
    await expect(followUser('unknown_dob_actor', 'user_1')).rejects.toMatchObject({
      status: 403,
    });
    expect(users.get('user_1').followingIds).not.toContain('minor_target');
    expect(users.get('unknown_dob_actor').followingIds).not.toContain('user_1');
  });

  it('builds a social graph including followers', async () => {
    users.set('user_1', baseUser('user_1', {
      friendIds: ['user_2'],
      followingIds: ['user_3'],
      friendRequestIds: ['user_3'],
      friendRequestSentIds: ['user_2'],
    }));
    users.set('user_3', baseUser('user_3', {
      followingIds: ['user_1'],
    }));

    const graph = await getSocialGraphForUser('user_1');

    expect(graph.user.id).toBe('user_1');
    expect(graph.friends.map((row) => row.id)).toEqual(['user_2']);
    expect(graph.following.map((row) => row.id)).toEqual(['user_3']);
    expect(graph.followers.map((row) => row.id)).toEqual(['user_3']);
    expect(graph.incomingFriendRequests.map((row) => row.id)).toEqual(['user_3']);
    expect(graph.outgoingFriendRequests.map((row) => row.id)).toEqual(['user_2']);
  });
});
