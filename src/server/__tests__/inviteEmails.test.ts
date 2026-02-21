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
      text: 'Open MVP to review your invite.',
      html: '<p>Open MVP to review your invite.</p>',
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

  it('attempts push delivery after a successful invite email send', async () => {
    await sendInviteEmails([{
      id: 'invite_1',
      email: 'player@example.com',
      userId: 'user_1',
      type: 'player',
      status: 'pending',
    }], 'http://localhost');

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendPushToUsersMock).toHaveBeenCalledWith(expect.objectContaining({
      userIds: ['user_1'],
      title: 'You are invited',
    }));
    expect(prismaMock.invites.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'invite_1' },
      data: { status: 'sent' },
    }));
  });

  it('does not attempt push when email sending fails', async () => {
    sendEmailMock.mockRejectedValue(new Error('smtp down'));

    await sendInviteEmails([{
      id: 'invite_2',
      email: 'player@example.com',
      userId: 'user_1',
      type: 'player',
      status: 'pending',
    }], 'http://localhost');

    expect(sendPushToUsersMock).not.toHaveBeenCalled();
    expect(prismaMock.invites.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'invite_2' },
      data: { status: 'failed' },
    }));
  });
});
