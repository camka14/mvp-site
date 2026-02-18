/** @jest-environment node */

import { NextRequest } from 'next/server';

const requireSessionMock = jest.fn();
const withLegacyFieldsMock = jest.fn((row) => ({ ...row, $id: row.id }));
const withLegacyListMock = jest.fn((rows) => rows.map((row: any) => ({ ...row, $id: row.id })));

const getSocialGraphForUserMock = jest.fn();
const sendFriendRequestMock = jest.fn();
const acceptFriendRequestMock = jest.fn();
const declineFriendRequestMock = jest.fn();
const removeFriendMock = jest.fn();
const followUserMock = jest.fn();
const unfollowUserMock = jest.fn();

jest.mock('@/lib/permissions', () => ({ requireSession: (...args: any[]) => requireSessionMock(...args) }));
jest.mock('@/server/legacyFormat', () => ({
  withLegacyFields: (...args: any[]) => withLegacyFieldsMock(...args),
  withLegacyList: (...args: any[]) => withLegacyListMock(...args),
}));
jest.mock('@/server/socialGraph', () => ({
  getSocialGraphForUser: (...args: any[]) => getSocialGraphForUserMock(...args),
  sendFriendRequest: (...args: any[]) => sendFriendRequestMock(...args),
  acceptFriendRequest: (...args: any[]) => acceptFriendRequestMock(...args),
  declineFriendRequest: (...args: any[]) => declineFriendRequestMock(...args),
  removeFriend: (...args: any[]) => removeFriendMock(...args),
  followUser: (...args: any[]) => followUserMock(...args),
  unfollowUser: (...args: any[]) => unfollowUserMock(...args),
  SocialGraphError: class SocialGraphError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

import { GET as socialGet } from '@/app/api/users/social/route';
import { POST as sendFriendRequestPost } from '@/app/api/users/social/friend-requests/route';
import { POST as acceptFriendRequestPost } from '@/app/api/users/social/friend-requests/[requesterId]/accept/route';
import { DELETE as declineFriendRequestDelete } from '@/app/api/users/social/friend-requests/[requesterId]/route';
import { DELETE as removeFriendDelete } from '@/app/api/users/social/friends/[friendId]/route';
import { POST as followPost } from '@/app/api/users/social/following/route';
import { DELETE as unfollowDelete } from '@/app/api/users/social/following/[targetUserId]/route';

const jsonRequest = (method: string, url: string, body?: unknown) => {
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
};

describe('social routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
  });

  it('returns social graph for the signed-in user', async () => {
    getSocialGraphForUserMock.mockResolvedValue({
      user: { id: 'user_1' },
      friends: [{ id: 'user_2' }],
      following: [{ id: 'user_3' }],
      followers: [{ id: 'user_4' }],
      incomingFriendRequests: [{ id: 'user_5' }],
      outgoingFriendRequests: [{ id: 'user_6' }],
    });

    const response = await socialGet(new NextRequest('http://localhost/api/users/social'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(getSocialGraphForUserMock).toHaveBeenCalledWith('user_1');
    expect(payload.user.$id).toBe('user_1');
    expect(payload.friends).toHaveLength(1);
    expect(payload.following).toHaveLength(1);
  });

  it('sends friend requests', async () => {
    sendFriendRequestMock.mockResolvedValue({ id: 'user_1' });

    const response = await sendFriendRequestPost(
      jsonRequest('POST', 'http://localhost/api/users/social/friend-requests', { targetUserId: 'user_2' }),
    );

    expect(response.status).toBe(200);
    expect(sendFriendRequestMock).toHaveBeenCalledWith('user_1', 'user_2');
  });

  it('accepts incoming friend requests', async () => {
    acceptFriendRequestMock.mockResolvedValue({ id: 'user_1' });

    const response = await acceptFriendRequestPost(
      jsonRequest('POST', 'http://localhost/api/users/social/friend-requests/user_2/accept'),
      { params: Promise.resolve({ requesterId: 'user_2' }) },
    );

    expect(response.status).toBe(200);
    expect(acceptFriendRequestMock).toHaveBeenCalledWith('user_1', 'user_2');
  });

  it('declines incoming friend requests', async () => {
    declineFriendRequestMock.mockResolvedValue({ id: 'user_1' });

    const response = await declineFriendRequestDelete(
      jsonRequest('DELETE', 'http://localhost/api/users/social/friend-requests/user_2'),
      { params: Promise.resolve({ requesterId: 'user_2' }) },
    );

    expect(response.status).toBe(200);
    expect(declineFriendRequestMock).toHaveBeenCalledWith('user_1', 'user_2');
  });

  it('removes existing friends', async () => {
    removeFriendMock.mockResolvedValue({ id: 'user_1' });

    const response = await removeFriendDelete(
      jsonRequest('DELETE', 'http://localhost/api/users/social/friends/user_2'),
      { params: Promise.resolve({ friendId: 'user_2' }) },
    );

    expect(response.status).toBe(200);
    expect(removeFriendMock).toHaveBeenCalledWith('user_1', 'user_2');
  });

  it('follows and unfollows users', async () => {
    followUserMock.mockResolvedValue({ id: 'user_1' });
    unfollowUserMock.mockResolvedValue({ id: 'user_1' });

    const followResponse = await followPost(
      jsonRequest('POST', 'http://localhost/api/users/social/following', { targetUserId: 'user_2' }),
    );
    expect(followResponse.status).toBe(200);
    expect(followUserMock).toHaveBeenCalledWith('user_1', 'user_2');

    const unfollowResponse = await unfollowDelete(
      jsonRequest('DELETE', 'http://localhost/api/users/social/following/user_2'),
      { params: Promise.resolve({ targetUserId: 'user_2' }) },
    );
    expect(unfollowResponse.status).toBe(200);
    expect(unfollowUserMock).toHaveBeenCalledWith('user_1', 'user_2');
  });
});
