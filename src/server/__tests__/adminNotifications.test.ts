/** @jest-environment node */

const isEmailEnabledMock = jest.fn();
const sendEmailMock = jest.fn();

jest.mock('@/server/email', () => ({
  isEmailEnabled: (...args: any[]) => isEmailEnabledMock(...args),
  sendEmail: (...args: any[]) => sendEmailMock(...args),
}));

import {
  sendAdminAccountCreatedNotification,
  sendAdminEventCreatedNotification,
} from '@/server/adminNotifications';

describe('adminNotifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.ADMIN_NOTIFICATION_EMAIL_TO;
    isEmailEnabledMock.mockReturnValue(true);
    sendEmailMock.mockResolvedValue(undefined);
  });

  it('sends new account notifications to the requested internal recipient', async () => {
    await sendAdminAccountCreatedNotification({
      userId: 'user_1',
      email: 'test@example.com',
      name: 'Test <User>',
      firstName: 'Test',
      lastName: 'User',
      userName: 'tester',
      dateOfBirth: new Date('2000-01-02T00:00:00.000Z'),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      authProvider: 'password',
    });

    expect(sendEmailMock).toHaveBeenCalledWith(expect.objectContaining({
      to: 'samuel.r@razumly.com',
      subject: '[BracketIQ] New account: test@example.com',
      text: expect.stringContaining('User ID: user_1'),
      html: expect.stringContaining('Test &lt;User&gt;'),
    }));
  });

  it('skips admin notifications when email delivery is not configured', async () => {
    isEmailEnabledMock.mockReturnValue(false);

    await sendAdminEventCreatedNotification({
      event: {
        id: 'event_1',
        name: 'Opening Night',
        hostId: 'host_1',
      },
      baseUrl: 'https://bracket-iq.com',
    });

    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});
