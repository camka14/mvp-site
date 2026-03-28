/** @jest-environment node */

const prismaMock = {
  events: { findMany: jest.fn() },
  organizations: { findMany: jest.fn() },
  teams: { findMany: jest.fn() },
  invites: { update: jest.fn() },
};

const buildInviteEmailMock = jest.fn();
const isEmailEnabledMock = jest.fn();
const sendEmailMock = jest.fn();
const sendPushToUsersMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/server/emailTemplates', () => ({ buildInviteEmail: (...args: any[]) => buildInviteEmailMock(...args) }));
jest.mock('@/server/email', () => ({
  isEmailEnabled: () => isEmailEnabledMock(),
  sendEmail: (...args: any[]) => sendEmailMock(...args),
}));
jest.mock('@/server/pushNotifications', () => ({ sendPushToUsers: (...args: any[]) => sendPushToUsersMock(...args) }));

import { sendInviteEmails } from '@/server/inviteEmails';

describe('sendInviteEmails', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.events.findMany.mockResolvedValue([]);
    prismaMock.organizations.findMany.mockResolvedValue([]);
    prismaMock.teams.findMany.mockResolvedValue([]);
    prismaMock.invites.update.mockResolvedValue({});

    buildInviteEmailMock.mockReturnValue({
      subject: 'You are invited',
      text: 'Open BracketIQ to review your invite.',
      html: '<p>Open BracketIQ to review your invite.</p>',
    });
    isEmailEnabledMock.mockReturnValue(true);
    sendEmailMock.mockResolvedValue(undefined);
    sendPushToUsersMock.mockResolvedValue({
      attempted: true,
      recipientCount: 1,
      tokenCount: 1,
      successCount: 1,
      failureCount: 0,
      prunedTokenCount: 0,
    });
  });

  it('uses push delivery for user-id invites when push targets exist', async () => {
    const invites = await sendInviteEmails([{
      id: 'invite_1',
      email: 'player@example.com',
      userId: 'user_1',
      type: 'TEAM',
      status: 'PENDING',
    }], 'http://localhost');

    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(sendPushToUsersMock).toHaveBeenCalledWith(expect.objectContaining({
      userIds: ['user_1'],
      title: 'You are invited',
    }));
    expect(invites).toEqual([expect.objectContaining({
      id: 'invite_1',
      status: 'PENDING',
    })]);
  });

  it('falls back to email when a user-id invite has no push targets', async () => {
    sendPushToUsersMock.mockResolvedValue({
      attempted: false,
      reason: 'no_tokens',
      recipientCount: 1,
      tokenCount: 0,
      successCount: 0,
      failureCount: 0,
      prunedTokenCount: 0,
    });

    const invites = await sendInviteEmails([{
      id: 'invite_2',
      email: 'player@example.com',
      userId: 'user_1',
      type: 'TEAM',
      status: 'PENDING',
    }], 'http://localhost');

    expect(sendPushToUsersMock).toHaveBeenCalledWith(expect.objectContaining({
      userIds: ['user_1'],
    }));
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(invites).toEqual([expect.objectContaining({
      id: 'invite_2',
      status: 'PENDING',
    })]);
  });

  it('marks invite as FAILED when email fallback fails', async () => {
    sendPushToUsersMock.mockResolvedValue({
      attempted: false,
      reason: 'no_tokens',
      recipientCount: 1,
      tokenCount: 0,
      successCount: 0,
      failureCount: 0,
      prunedTokenCount: 0,
    });
    sendEmailMock.mockRejectedValue(new Error('smtp down'));
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const invites = await sendInviteEmails([{
      id: 'invite_3',
      email: 'player@example.com',
      userId: 'user_1',
      type: 'TEAM',
      status: 'PENDING',
    }], 'http://localhost');

    expect(sendPushToUsersMock).toHaveBeenCalled();
    expect(invites).toEqual([expect.objectContaining({
      id: 'invite_3',
      status: 'FAILED',
    })]);
    expect(prismaMock.invites.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'invite_3' },
      data: expect.objectContaining({ status: 'FAILED' }),
    }));
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});
