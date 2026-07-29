/** @jest-environment node */

const sendAdminOrganizationClaimNotificationMock = jest.fn();
const ensureDefaultOrganizationRolesMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: {} }));
jest.mock('@/server/adminNotifications', () => ({
  sendAdminOrganizationClaimNotification: (...args: unknown[]) => (
    sendAdminOrganizationClaimNotificationMock(...args)
  ),
}));
jest.mock('@/server/email', () => ({
  isEmailEnabled: () => false,
  sendEmail: jest.fn(),
}));
jest.mock('@/server/organizationRoles', () => ({
  ensureDefaultOrganizationRoles: (...args: unknown[]) => ensureDefaultOrganizationRolesMock(...args),
}));

import {
  OrganizationClaimMethodEnum,
  OrganizationClaimRequestTypeEnum,
  OrganizationClaimStatusEnum,
  OrganizationClaimVerificationLevelEnum,
  OrganizationOwnershipStatusEnum,
} from '@/generated/prisma/client';
import {
  acceptOrganizationClaim,
  createOrganizationClaim,
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
});
