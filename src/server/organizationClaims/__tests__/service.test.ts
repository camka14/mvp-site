/** @jest-environment node */

const sendAdminOrganizationClaimNotificationMock = jest.fn();
const ensureDefaultOrganizationRolesMock = jest.fn();
const isEmailEnabledMock = jest.fn();
const sendEmailMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: {} }));
jest.mock('@/server/adminNotifications', () => ({
  sendAdminOrganizationClaimNotification: (...args: unknown[]) => (
    sendAdminOrganizationClaimNotificationMock(...args)
  ),
}));
jest.mock('@/server/email', () => ({
  isEmailEnabled: () => isEmailEnabledMock(),
  sendEmail: (...args: unknown[]) => sendEmailMock(...args),
}));
jest.mock('@/server/organizationRoles', () => ({
  ensureDefaultOrganizationRoles: (...args: unknown[]) => ensureDefaultOrganizationRolesMock(...args),
}));

import {
  OrganizationClaimMethodEnum,
  OrganizationClaimRequestTypeEnum,
  OrganizationClaimStatusEnum,
  OrganizationClaimVerificationLevelEnum,
  OrganizationOwnershipResolutionEnum,
  OrganizationOwnershipStatusEnum,
} from '@/generated/prisma/client';
import {
  acceptOrganizationClaim,
  createOrganizationClaim,
  decideOrganizationClaim,
  getOrganizationClaimPresentation,
} from '@/server/organizationClaims/service';

const now = new Date('2026-07-29T20:00:00.000Z');

const organization = {
  id: 'org_1',
  name: 'River City Sports Club',
  ownerId: 'admin_1',
  website: 'https://rivercitysports.org',
  originType: 'AFFILIATE_IMPORTED',
  ownershipStatus: OrganizationOwnershipStatusEnum.UNCLAIMED,
  claimVerificationLevel: OrganizationClaimVerificationLevelEnum.NONE,
};

const domain = {
  id: 'domain_1',
  organizationId: 'org_1',
  url: 'https://rivercitysports.org/',
  host: 'rivercitysports.org',
  registrableDomain: 'rivercitysports.org',
  source: 'AFFILIATE_SOURCE',
  isPrimary: true,
  isSharedPlatform: false,
  verifiedAt: null,
  lastCheckedAt: null,
  createdAt: now,
  updatedAt: now,
};

describe('organization claim service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sendAdminOrganizationClaimNotificationMock.mockResolvedValue(undefined);
    ensureDefaultOrganizationRolesMock.mockResolvedValue(undefined);
    isEmailEnabledMock.mockReturnValue(false);
    sendEmailMock.mockResolvedValue(undefined);
  });

  it('returns a named privacy-safe public claim presentation', async () => {
    const client: any = {
      organizations: {
        findUnique: jest.fn().mockResolvedValue(organization),
      },
      organizationDomains: {
        findFirst: jest.fn().mockResolvedValue(domain),
      },
    };

    await expect(getOrganizationClaimPresentation('org_1', null, client)).resolves.toEqual(
      expect.objectContaining({
        organizationId: 'org_1',
        organizationName: 'River City Sports Club',
        ownershipStatus: 'UNCLAIMED',
        claimable: true,
        displayDomain: 'rivercitysports.org',
      }),
    );
  });

  it('creates a manual initial claim, reserves the profile, and notifies the admin', async () => {
    let createdClaim: any = null;
    const transactionClient: any = {
      organizations: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      organizationClaims: {
        create: jest.fn().mockImplementation(async ({ data }) => {
          createdClaim = {
            ...data,
            createdAt: now,
            updatedAt: now,
          };
          return createdClaim;
        }),
      },
      organizationClaimEvents: {
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const client: any = {
      organizations: {
        findUnique: jest.fn().mockResolvedValue(organization),
      },
      organizationDomains: {
        findFirst: jest.fn().mockResolvedValue(domain),
      },
      organizationClaims: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockImplementation(async () => createdClaim),
      },
      organizationClaimEvidence: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      organizationClaimEvents: {
        create: jest.fn().mockResolvedValue({}),
      },
      authUser: {
        findUnique: jest.fn().mockResolvedValue({ email: 'owner@rivercitysports.org' }),
      },
      $transaction: jest.fn().mockImplementation(async (callback) => callback(transactionClient)),
    };

    const view = await createOrganizationClaim({
      organizationId: 'org_1',
      requestType: OrganizationClaimRequestTypeEnum.INITIAL_CLAIM,
      method: OrganizationClaimMethodEnum.MANUAL_REVIEW,
      roleTitle: 'Club director',
      explanation: 'I manage the club and its public website.',
      officialContactEmail: 'board@rivercitysports.org',
    }, {
      userId: 'user_1',
      sessionVersion: 3,
    }, client);

    expect(view).toEqual(expect.objectContaining({
      organizationId: 'org_1',
      claimantUserId: 'user_1',
      status: OrganizationClaimStatusEnum.PENDING_MANUAL_REVIEW,
      method: OrganizationClaimMethodEnum.MANUAL_REVIEW,
    }));
    expect(transactionClient.organizations.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'org_1',
          ownershipStatus: OrganizationOwnershipStatusEnum.UNCLAIMED,
        },
        data: expect.objectContaining({
          ownershipStatus: OrganizationOwnershipStatusEnum.CLAIM_PENDING,
        }),
      }),
    );
    expect(sendAdminOrganizationClaimNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        claim: expect.objectContaining({
          organizationName: 'River City Sports Club',
          requestType: OrganizationClaimRequestTypeEnum.INITIAL_CLAIM,
        }),
      }),
    );
  });

  it('rejects a domain-email claim when the email is outside the official domain', async () => {
    const client: any = {
      organizations: {
        findUnique: jest.fn().mockResolvedValue(organization),
      },
      organizationDomains: {
        findFirst: jest.fn().mockResolvedValue(domain),
      },
    };

    await expect(createOrganizationClaim({
      organizationId: 'org_1',
      requestType: OrganizationClaimRequestTypeEnum.INITIAL_CLAIM,
      method: OrganizationClaimMethodEnum.DOMAIN_EMAIL,
      verificationEmail: 'owner@gmail.com',
    }, {
      userId: 'user_1',
      sessionVersion: 3,
    }, client)).rejects.toMatchObject({
      code: 'DOMAIN_EMAIL_MISMATCH',
      status: 400,
    });
  });

  it('accepts an approved claim once and updates ownership transactionally', async () => {
    const approvedClaim = {
      id: 'claim_1',
      organizationId: 'org_1',
      claimantUserId: 'user_1',
      requestType: OrganizationClaimRequestTypeEnum.INITIAL_CLAIM,
      status: OrganizationClaimStatusEnum.APPROVED_PENDING_ACCEPTANCE,
      method: OrganizationClaimMethodEnum.DOMAIN_EMAIL,
      verificationLevel: OrganizationClaimVerificationLevelEnum.AFFILIATION,
      verificationEmail: 'director@rivercitysports.org',
      roleTitle: null,
      explanation: null,
      publicEvidenceUrl: null,
      issueReason: null,
      requestedOutcome: null,
      resolution: null,
      submittedAt: null,
      expiresAt: null,
      decidedAt: null,
      userDecisionMessage: null,
      acceptedAt: null,
      currentOwnerResponseDueAt: null,
      currentOwnerRespondedAt: null,
      currentOwnerApprovedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const transactionClient: any = {
      organizationClaims: {
        findFirst: jest.fn().mockResolvedValue(approvedClaim),
        updateMany: jest.fn()
          .mockResolvedValueOnce({ count: 1 })
          .mockResolvedValueOnce({ count: 0 }),
      },
      organizations: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'org_1',
          ownerId: 'admin_1',
          ownershipStatus: OrganizationOwnershipStatusEnum.CLAIM_PENDING,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      organizationDomains: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      organizationClaimEvents: {
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const acceptedClaim = {
      ...approvedClaim,
      status: OrganizationClaimStatusEnum.APPROVED,
      acceptedAt: now,
      updatedAt: now,
    };
    const client: any = {
      $transaction: jest.fn().mockImplementation(async (callback) => callback(transactionClient)),
      organizationClaims: {
        findUnique: jest.fn().mockResolvedValue(acceptedClaim),
      },
      organizations: {
        findUnique: jest.fn().mockResolvedValue({
          ...organization,
          ownerId: 'user_1',
          ownershipStatus: OrganizationOwnershipStatusEnum.CLAIMED,
        }),
      },
      organizationDomains: {
        findFirst: jest.fn().mockResolvedValue(domain),
      },
      organizationClaimEvidence: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      staffMembers: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      organizationReviews: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const view = await acceptOrganizationClaim({
      organizationId: 'org_1',
      claimId: 'claim_1',
      mfaConfirmed: true,
    }, {
      userId: 'user_1',
    }, client);

    expect(view.status).toBe(OrganizationClaimStatusEnum.APPROVED);
    expect(transactionClient.organizations.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'org_1',
        ownershipStatus: OrganizationOwnershipStatusEnum.CLAIM_PENDING,
      },
      data: expect.objectContaining({
        ownerId: 'user_1',
        ownershipStatus: OrganizationOwnershipStatusEnum.CLAIMED,
        claimVerificationLevel: OrganizationClaimVerificationLevelEnum.AFFILIATION,
      }),
    });
    expect(ensureDefaultOrganizationRolesMock).toHaveBeenCalledWith(
      transactionClient,
      'org_1',
    );
  });

  it('emails the claimant after an administrator decision commits', async () => {
    isEmailEnabledMock.mockReturnValue(true);
    const pendingClaim = {
      id: 'claim_1',
      organizationId: 'org_1',
      claimantUserId: 'user_1',
      requestType: OrganizationClaimRequestTypeEnum.INITIAL_CLAIM,
      status: OrganizationClaimStatusEnum.PENDING_MANUAL_REVIEW,
      method: OrganizationClaimMethodEnum.MANUAL_REVIEW,
      verificationLevel: OrganizationClaimVerificationLevelEnum.NONE,
      verificationEmail: null,
      roleTitle: 'Director',
      explanation: 'I run the club.',
      publicEvidenceUrl: null,
      issueReason: null,
      requestedOutcome: null,
      resolution: null,
      submittedAt: now,
      expiresAt: now,
      decidedAt: null,
      userDecisionMessage: null,
      acceptedAt: null,
      currentOwnerResponseDueAt: null,
      currentOwnerRespondedAt: null,
      credibilityDecidedAt: null,
      credibilityDecidedByUserId: null,
      createdAt: now,
      updatedAt: now,
    };
    const decidedClaim = {
      ...pendingClaim,
      status: OrganizationClaimStatusEnum.APPROVED_PENDING_ACCEPTANCE,
      verificationLevel: OrganizationClaimVerificationLevelEnum.MANUAL_REVIEW,
      decidedAt: now,
      userDecisionMessage: 'Your public evidence confirms your role.',
    };
    const transactionClient: any = {
      organizationClaims: {
        update: jest.fn().mockResolvedValue(decidedClaim),
      },
      organizationClaimEvents: {
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const client: any = {
      organizationClaims: {
        findUnique: jest.fn().mockResolvedValue(pendingClaim),
      },
      organizations: {
        findUnique: jest.fn().mockResolvedValue(organization),
      },
      organizationDomains: {
        findFirst: jest.fn().mockResolvedValue(domain),
      },
      organizationClaimEvidence: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      organizationClaimEvents: {
        create: jest.fn().mockResolvedValue({}),
      },
      authUser: {
        findUnique: jest.fn().mockResolvedValue({ email: 'claimant@test.com' }),
      },
      $transaction: jest.fn().mockImplementation(async (callback) => callback(transactionClient)),
    };

    await expect(decideOrganizationClaim({
      claimId: 'claim_1',
      action: 'APPROVE',
      verificationLevel: OrganizationClaimVerificationLevelEnum.MANUAL_REVIEW,
      userDecisionMessage: 'Your public evidence confirms your role.',
    }, {
      userId: 'admin_1',
      adminEmail: 'samuel.r@razumly.com',
    }, client)).resolves.toEqual(expect.objectContaining({
      status: OrganizationClaimStatusEnum.APPROVED_PENDING_ACCEPTANCE,
    }));

    expect(sendEmailMock).toHaveBeenCalledWith(expect.objectContaining({
      to: 'claimant@test.com',
      subject: 'Update on your River City Sports Club ownership request',
      text: expect.stringContaining('Your public evidence confirms your role.'),
    }));
    expect(client.organizationClaimEvents.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: 'CLAIMANT_DECISION_NOTIFICATION_SENT',
      }),
    });
  });

  it('keeps a committed administrator decision when claimant email delivery fails', async () => {
    isEmailEnabledMock.mockReturnValue(true);
    sendEmailMock.mockRejectedValueOnce(new Error('smtp down'));
    const pendingClaim = {
      id: 'claim_2',
      organizationId: 'org_1',
      claimantUserId: 'user_1',
      requestType: OrganizationClaimRequestTypeEnum.INITIAL_CLAIM,
      status: OrganizationClaimStatusEnum.PENDING_MANUAL_REVIEW,
      method: OrganizationClaimMethodEnum.MANUAL_REVIEW,
      verificationLevel: OrganizationClaimVerificationLevelEnum.NONE,
      verificationEmail: null,
      roleTitle: 'Director',
      explanation: 'I run the club.',
      publicEvidenceUrl: null,
      issueReason: null,
      requestedOutcome: null,
      resolution: null,
      submittedAt: now,
      expiresAt: now,
      decidedAt: null,
      userDecisionMessage: null,
      acceptedAt: null,
      currentOwnerResponseDueAt: null,
      currentOwnerRespondedAt: null,
      credibilityDecidedAt: null,
      credibilityDecidedByUserId: null,
      createdAt: now,
      updatedAt: now,
    };
    const rejectedClaim = {
      ...pendingClaim,
      status: OrganizationClaimStatusEnum.REJECTED,
      verificationLevel: OrganizationClaimVerificationLevelEnum.MANUAL_REVIEW,
      decidedAt: now,
      userDecisionMessage: 'We could not confirm your authority.',
    };
    const transactionClient: any = {
      organizationClaims: {
        update: jest.fn().mockResolvedValue(rejectedClaim),
      },
      organizations: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      organizationClaimEvents: {
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const client: any = {
      organizationClaims: {
        findUnique: jest.fn().mockResolvedValue(pendingClaim),
      },
      organizations: {
        findUnique: jest.fn().mockResolvedValue(organization),
      },
      organizationDomains: {
        findFirst: jest.fn().mockResolvedValue(domain),
      },
      organizationClaimEvidence: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      organizationClaimEvents: {
        create: jest.fn().mockResolvedValue({}),
      },
      authUser: {
        findUnique: jest.fn().mockResolvedValue({ email: 'claimant@test.com' }),
      },
      $transaction: jest.fn().mockImplementation(async (callback) => callback(transactionClient)),
    };

    await expect(decideOrganizationClaim({
      claimId: 'claim_2',
      action: 'REJECT',
      userDecisionMessage: 'We could not confirm your authority.',
    }, {
      userId: 'admin_1',
      adminEmail: 'samuel.r@razumly.com',
    }, client)).resolves.toEqual(expect.objectContaining({
      status: OrganizationClaimStatusEnum.REJECTED,
    }));

    expect(client.organizationClaimEvents.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: 'CLAIMANT_DECISION_NOTIFICATION_FAILED',
        metadata: { message: 'smtp down' },
      }),
    });
  });

  it('notifies the current owner of a dispute resolution without claimant-only copy', async () => {
    isEmailEnabledMock.mockReturnValue(true);
    const disputedClaim = {
      id: 'claim_3',
      organizationId: 'org_1',
      claimantUserId: 'user_1',
      requestType: OrganizationClaimRequestTypeEnum.OWNERSHIP_DISPUTE,
      status: OrganizationClaimStatusEnum.DISPUTED,
      method: OrganizationClaimMethodEnum.MANUAL_REVIEW,
      verificationLevel: OrganizationClaimVerificationLevelEnum.MANUAL_REVIEW,
      verificationEmail: null,
      roleTitle: 'Director',
      explanation: 'I run the club.',
      publicEvidenceUrl: null,
      issueReason: null,
      requestedOutcome: null,
      resolution: null,
      submittedAt: now,
      expiresAt: now,
      decidedAt: null,
      userDecisionMessage: null,
      acceptedAt: null,
      currentOwnerResponseDueAt: now,
      currentOwnerRespondedAt: now,
      credibilityDecidedAt: now,
      credibilityDecidedByUserId: 'admin_1',
      createdAt: now,
      updatedAt: now,
    };
    const resolvedClaim = {
      ...disputedClaim,
      status: OrganizationClaimStatusEnum.REJECTED,
      resolution: 'UPHOLD_CURRENT_OWNER',
      decidedAt: now,
      userDecisionMessage: 'Claimant-only explanation of the decision.',
    };
    const transactionClient: any = {
      organizationClaims: {
        update: jest.fn().mockResolvedValue(resolvedClaim),
      },
      organizations: {
        update: jest.fn().mockResolvedValue({}),
      },
      organizationClaimEvents: {
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const client: any = {
      organizationClaims: {
        findUnique: jest.fn().mockResolvedValue(disputedClaim),
      },
      organizations: {
        findUnique: jest.fn().mockResolvedValue(organization),
      },
      organizationDomains: {
        findFirst: jest.fn().mockResolvedValue(domain),
      },
      organizationClaimEvidence: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      organizationClaimEvents: {
        create: jest.fn().mockResolvedValue({}),
      },
      authUser: {
        findUnique: jest.fn().mockImplementation(({ where }: { where: { id: string } }) => (
          Promise.resolve({
            email: where.id === 'user_1' ? 'claimant@test.com' : 'owner@test.com',
          })
        )),
      },
      $transaction: jest.fn().mockImplementation(async (callback) => callback(transactionClient)),
    };

    await decideOrganizationClaim({
      claimId: 'claim_3',
      action: 'RESOLVE',
      resolution: OrganizationOwnershipResolutionEnum.UPHOLD_CURRENT_OWNER,
      userDecisionMessage: 'Claimant-only explanation of the decision.',
    }, {
      userId: 'admin_1',
      adminEmail: 'samuel.r@razumly.com',
    }, client);

    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    const ownerEmail = sendEmailMock.mock.calls
      .map(([payload]) => payload as { to: string; text: string })
      .find((payload) => payload.to === 'owner@test.com');
    expect(ownerEmail).toEqual(expect.objectContaining({
      text: expect.stringContaining('uphold current owner'),
    }));
    expect(ownerEmail?.text).not.toContain('Claimant-only explanation');
    expect(client.organizationClaimEvents.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: 'CURRENT_OWNER_DECISION_NOTIFICATION_SENT',
      }),
    });
  });
});
