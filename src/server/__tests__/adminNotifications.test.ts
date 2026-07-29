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
  sendAdminOrganizationClaimNotification,
} from '@/server/adminNotifications';

describe('adminNotifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.ADMIN_NOTIFICATION_EMAIL_TO;
    delete process.env.ORGANIZATION_CLAIM_ADMIN_EMAIL_TO;
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

  it('sends dispute notifications to the default admin email', async () => {
    await sendAdminOrganizationClaimNotification({
      claim: {
        claimId: 'claim_1',
        organizationId: 'org_1',
        organizationName: 'River City Sports Club',
        claimantUserId: 'user_1',
        claimantEmail: 'director@rivercitysports.org',
        requestType: 'OWNERSHIP_DISPUTE',
        method: 'MANUAL_REVIEW',
        status: 'PENDING_MANUAL_REVIEW',
        issueReason: 'OWNER_UNAVAILABLE',
        requestedOutcome: 'OWNERSHIP_TRANSFER',
      },
      baseUrl: 'https://bracket-iq.com',
    });

    expect(sendEmailMock).toHaveBeenCalledWith(expect.objectContaining({
      to: 'samuel.r@razumly.com',
      subject: '[BracketIQ] New organization dispute: River City Sports Club',
      text: expect.stringContaining('Claim ID: claim_1'),
    }));
  });

  it('allows a claim-specific admin recipient override', async () => {
    process.env.ORGANIZATION_CLAIM_ADMIN_EMAIL_TO = 'claims@razumly.com';

    await sendAdminOrganizationClaimNotification({
      claim: {
        claimId: 'claim_2',
        organizationId: 'org_2',
        organizationName: 'Summit United',
        claimantUserId: 'user_2',
        requestType: 'INITIAL_CLAIM',
        method: 'DOMAIN_EMAIL',
        status: 'PENDING_VERIFICATION',
      },
    });

    expect(sendEmailMock).toHaveBeenCalledWith(expect.objectContaining({
      to: 'claims@razumly.com',
    }));
  });
});
