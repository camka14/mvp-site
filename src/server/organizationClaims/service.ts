import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  OrganizationClaimEvidenceStatusEnum,
  OrganizationClaimMethodEnum,
  OrganizationClaimRequestTypeEnum,
  OrganizationClaimStatusEnum,
  OrganizationClaimVerificationLevelEnum,
  OrganizationOwnershipIssueReasonEnum,
  OrganizationOwnershipRequestedOutcomeEnum,
  OrganizationOwnershipResolutionEnum,
  OrganizationOwnershipStatusEnum,
} from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { ensureDefaultOrganizationRoles } from '@/server/organizationRoles';
import { isEmailEnabled, sendEmail } from '@/server/email';
import { sendAdminOrganizationClaimNotification } from '@/server/adminNotifications';
import {
  emailMatchesOrganizationDomain,
  organizationDomainPolicyForUrl,
  type OrganizationDomainPolicy,
} from './domainPolicy';
import {
  checkOrganizationDnsChallenge,
  checkOrganizationHtmlChallenge,
  createOrganizationSiteChallengeValue,
  getOrganizationDnsChallengeHostname,
  ORGANIZATION_HTML_VERIFICATION_META_NAME,
} from './verification';

const EMAIL_CHALLENGE_TTL_MS = 30 * 60 * 1000;
const SITE_CHALLENGE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MANUAL_CLAIM_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CURRENT_OWNER_RESPONSE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const ACTIVE_CLAIM_STATUSES = [
  OrganizationClaimStatusEnum.PENDING_VERIFICATION,
  OrganizationClaimStatusEnum.PENDING_MANUAL_REVIEW,
  OrganizationClaimStatusEnum.APPROVED_PENDING_ACCEPTANCE,
  OrganizationClaimStatusEnum.DISPUTED,
] as const;

type ClaimClient = typeof prisma | any;

export type OrganizationClaimActor = {
  userId: string;
  isAdmin?: boolean;
  sessionVersion?: number | null;
};

export type OrganizationClaimPresentation = {
  organizationId: string;
  organizationName: string;
  originType: string;
  ownershipStatus: string;
  claimVerificationLevel: string;
  claimable: boolean;
  claimUrl: string;
  ownershipAction:
    | 'CLAIM'
    | 'VIEW_PENDING_CLAIM'
    | 'REQUEST_OWNERSHIP_TRANSFER'
    | 'REPORT_OWNERSHIP_ISSUE'
    | 'CONTACT_SUPPORT'
    | 'NONE';
  displayDomain: string | null;
  supportedMethods: OrganizationClaimMethodEnum[];
  signInRequired: boolean;
  viewerClaimId: string | null;
};

export type OrganizationClaimEvidenceView = {
  id: string;
  method: OrganizationClaimMethodEnum;
  status: OrganizationClaimEvidenceStatusEnum;
  expiresAt: string | null;
  verifiedAt: string | null;
  lastCheckedAt: string | null;
  failureReason: string | null;
  instructions: {
    emailDomain?: string;
    dnsHostname?: string;
    dnsValue?: string;
    htmlMetaName?: string;
    htmlMetaValue?: string;
  };
};

export type OrganizationClaimView = {
  id: string;
  organizationId: string;
  claimantUserId: string;
  requestType: OrganizationClaimRequestTypeEnum;
  status: OrganizationClaimStatusEnum;
  method: OrganizationClaimMethodEnum;
  verificationLevel: OrganizationClaimVerificationLevelEnum;
  verificationEmail: string | null;
  roleTitle: string | null;
  explanation: string | null;
  publicEvidenceUrl: string | null;
  issueReason: OrganizationOwnershipIssueReasonEnum | null;
  requestedOutcome: OrganizationOwnershipRequestedOutcomeEnum | null;
  resolution: OrganizationOwnershipResolutionEnum | null;
  submittedAt: string | null;
  expiresAt: string | null;
  decidedAt: string | null;
  userDecisionMessage: string | null;
  acceptedAt: string | null;
  currentOwnerResponseDueAt: string | null;
  currentOwnerRespondedAt: string | null;
  createdAt: string;
  updatedAt: string;
  evidence: OrganizationClaimEvidenceView[];
};

export type CreateOrganizationClaimInput = {
  organizationId: string;
  requestType: OrganizationClaimRequestTypeEnum;
  method: OrganizationClaimMethodEnum;
  verificationEmail?: string | null;
  roleTitle?: string | null;
  explanation?: string | null;
  publicEvidenceUrl?: string | null;
  officialContactName?: string | null;
  officialContactEmail?: string | null;
  officialContactPhone?: string | null;
  officialContactUrl?: string | null;
  issueReason?: OrganizationOwnershipIssueReasonEnum | null;
  requestedOutcome?: OrganizationOwnershipRequestedOutcomeEnum | null;
  parentRequestId?: string | null;
  certified?: boolean;
  baseUrl?: string | null;
};

export type VerifyOrganizationClaimInput = {
  organizationId: string;
  claimId: string;
};

export type DecideOrganizationClaimInput = {
  claimId: string;
  action: 'APPROVE' | 'REJECT' | 'MARK_DISPUTED' | 'RESOLVE' | 'REVOKE' | 'RESTORE';
  verificationLevel?: OrganizationClaimVerificationLevelEnum;
  userDecisionMessage: string;
  internalDecisionNotes?: string | null;
  resolution?: OrganizationOwnershipResolutionEnum | null;
};

export type AcceptOrganizationClaimInput = {
  organizationId: string;
  claimId: string;
  mfaConfirmed: true;
};

export class OrganizationClaimError extends Error {
  code: string;
  status: number;

  constructor(message: string, code: string, status = 400) {
    super(message);
    this.name = 'OrganizationClaimError';
    this.code = code;
    this.status = status;
  }
}

export const isOrganizationClaimError = (error: unknown): error is OrganizationClaimError => (
  error instanceof OrganizationClaimError
);

const addMs = (date: Date, ms: number): Date => new Date(date.getTime() + ms);
const createClaimId = (): string => `org_claim_${randomUUID()}`;
const createEvidenceId = (): string => `org_claim_evidence_${randomUUID()}`;
const createEventId = (): string => `org_claim_event_${randomUUID()}`;
const normalizeOptional = (value: string | null | undefined, maxLength = 4000): string | null => {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, maxLength) : null;
};
const normalizeEmail = (value: string | null | undefined): string | null => {
  const normalized = normalizeOptional(value, 320)?.toLowerCase() ?? null;
  return normalized && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized) ? normalized : null;
};
const hashValue = (value: string): string => createHash('sha256').update(value).digest('hex');
const safeHashMatches = (expectedHex: string, value: string): boolean => {
  const actual = Buffer.from(hashValue(value), 'hex');
  const expected = Buffer.from(expectedHex, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};
const claimUrlFor = (organizationId: string): string => (
  `/organizations/${encodeURIComponent(organizationId)}/claim`
);
const absoluteUrl = (baseUrl: string | null | undefined, path: string): string => {
  const configured = baseUrl?.trim()
    || process.env.PUBLIC_WEB_BASE_URL?.trim()
    || process.env.NEXT_PUBLIC_SITE_URL?.trim()
    || 'https://bracket-iq.com';
  return new URL(path, configured.endsWith('/') ? configured : `${configured}/`).toString();
};

const recordClaimEvent = async (
  client: ClaimClient,
  input: {
    organizationId: string;
    claimId?: string | null;
    actorUserId?: string | null;
    eventType: string;
    metadata?: Record<string, unknown> | null;
  },
): Promise<void> => {
  await client.organizationClaimEvents.create({
    data: {
      id: createEventId(),
      organizationId: input.organizationId,
      claimId: input.claimId ?? null,
      actorUserId: input.actorUserId ?? null,
      eventType: input.eventType,
      metadata: input.metadata ?? undefined,
    },
  });
};

const recordClaimEventSafe = async (
  client: ClaimClient,
  input: Parameters<typeof recordClaimEvent>[1],
): Promise<void> => {
  try {
    await recordClaimEvent(client, input);
  } catch (error) {
    console.warn('Failed to record organization claim event', {
      organizationId: input.organizationId,
      claimId: input.claimId,
      eventType: input.eventType,
      error,
    });
  }
};

const loadPrimaryDomain = async (
  client: ClaimClient,
  organization: { id: string; website: string | null },
) => {
  const row = await client.organizationDomains.findFirst({
    where: { organizationId: organization.id, isPrimary: true },
    orderBy: [{ verifiedAt: 'desc' }, { createdAt: 'asc' }],
  });
  if (row) {
    const policy = organizationDomainPolicyForUrl(row.url);
    return { row, policy };
  }
  if (!organization.website) return null;
  try {
    const policy = organizationDomainPolicyForUrl(organization.website);
    return { row: null, policy };
  } catch {
    return null;
  }
};

const supportedMethodsForPolicy = (
  policy: OrganizationDomainPolicy | null,
): OrganizationClaimMethodEnum[] => {
  const methods = (policy?.automaticMethods ?? []).map((method) => (
    OrganizationClaimMethodEnum[method]
  ));
  return [...methods, OrganizationClaimMethodEnum.MANUAL_REVIEW];
};

const toEvidenceView = (
  evidence: any,
  policy: OrganizationDomainPolicy | null,
): OrganizationClaimEvidenceView => {
  const instructions: OrganizationClaimEvidenceView['instructions'] = {};
  if (evidence.method === OrganizationClaimMethodEnum.DOMAIN_EMAIL && policy) {
    instructions.emailDomain = policy.registrableDomain;
  } else if (evidence.method === OrganizationClaimMethodEnum.DNS_TXT && policy) {
    instructions.dnsHostname = getOrganizationDnsChallengeHostname(policy.registrableDomain);
    instructions.dnsValue = evidence.challengeValue ?? undefined;
  } else if (evidence.method === OrganizationClaimMethodEnum.HTML_META) {
    instructions.htmlMetaName = ORGANIZATION_HTML_VERIFICATION_META_NAME;
    instructions.htmlMetaValue = evidence.challengeValue ?? undefined;
  }
  return {
    id: evidence.id,
    method: evidence.method,
    status: evidence.status,
    expiresAt: evidence.expiresAt?.toISOString?.() ?? null,
    verifiedAt: evidence.verifiedAt?.toISOString?.() ?? null,
    lastCheckedAt: evidence.lastCheckedAt?.toISOString?.() ?? null,
    failureReason: evidence.failureReason ?? null,
    instructions,
  };
};

const loadClaimView = async (
  client: ClaimClient,
  claim: any,
): Promise<OrganizationClaimView> => {
  const [organization, evidence] = await Promise.all([
    client.organizations.findUnique({
      where: { id: claim.organizationId },
      select: { id: true, website: true },
    }),
    client.organizationClaimEvidence.findMany({
      where: { claimId: claim.id },
      orderBy: { createdAt: 'asc' },
    }),
  ]);
  const domain = organization ? await loadPrimaryDomain(client, organization) : null;
  return {
    id: claim.id,
    organizationId: claim.organizationId,
    claimantUserId: claim.claimantUserId,
    requestType: claim.requestType,
    status: claim.status,
    method: claim.method,
    verificationLevel: claim.verificationLevel,
    verificationEmail: claim.verificationEmail ?? null,
    roleTitle: claim.roleTitle ?? null,
    explanation: claim.explanation ?? null,
    publicEvidenceUrl: claim.publicEvidenceUrl ?? null,
    issueReason: claim.issueReason ?? null,
    requestedOutcome: claim.requestedOutcome ?? null,
    resolution: claim.resolution ?? null,
    submittedAt: claim.submittedAt?.toISOString?.() ?? null,
    expiresAt: claim.expiresAt?.toISOString?.() ?? null,
    decidedAt: claim.decidedAt?.toISOString?.() ?? null,
    userDecisionMessage: claim.userDecisionMessage ?? null,
    acceptedAt: claim.acceptedAt?.toISOString?.() ?? null,
    currentOwnerResponseDueAt: claim.currentOwnerResponseDueAt?.toISOString?.() ?? null,
    currentOwnerRespondedAt: claim.currentOwnerRespondedAt?.toISOString?.() ?? null,
    createdAt: claim.createdAt.toISOString(),
    updatedAt: claim.updatedAt.toISOString(),
    evidence: evidence.map((item: any) => toEvidenceView(item, domain?.policy ?? null)),
  };
};

const requireClaimActor = (claim: any, actor: OrganizationClaimActor): void => {
  if (actor.isAdmin || claim.claimantUserId === actor.userId) return;
  throw new OrganizationClaimError('Claim not found.', 'ORGANIZATION_CLAIM_NOT_FOUND', 404);
};

const validateRequestTypeForOrganization = (
  organization: any,
  input: CreateOrganizationClaimInput,
  actor: OrganizationClaimActor,
): void => {
  if (organization.ownerId === actor.userId) {
    throw new OrganizationClaimError(
      'You already own this organization.',
      'ORGANIZATION_ALREADY_OWNED_BY_USER',
      409,
    );
  }
  if (input.requestType === OrganizationClaimRequestTypeEnum.INITIAL_CLAIM) {
    if (organization.ownershipStatus !== OrganizationOwnershipStatusEnum.UNCLAIMED) {
      throw new OrganizationClaimError(
        'This organization is not available for an initial claim.',
        'ORGANIZATION_NOT_CLAIMABLE',
        409,
      );
    }
    return;
  }
  if (
    input.requestType === OrganizationClaimRequestTypeEnum.OWNERSHIP_TRANSFER
    || input.requestType === OrganizationClaimRequestTypeEnum.OWNERSHIP_DISPUTE
  ) {
    if (
      organization.ownershipStatus !== OrganizationOwnershipStatusEnum.CLAIMED
      && organization.ownershipStatus !== OrganizationOwnershipStatusEnum.DISPUTED
    ) {
      throw new OrganizationClaimError(
        'This organization does not currently have an owner to replace.',
        'ORGANIZATION_OWNERSHIP_REQUEST_UNAVAILABLE',
        409,
      );
    }
    return;
  }
  if (input.method !== OrganizationClaimMethodEnum.MANUAL_REVIEW) {
    throw new OrganizationClaimError(
      'Duplicate profile review requires manual review.',
      'DUPLICATE_PROFILE_REQUIRES_MANUAL_REVIEW',
      400,
    );
  }
};

const verificationLevelForMethod = (
  method: OrganizationClaimMethodEnum,
): OrganizationClaimVerificationLevelEnum => {
  if (method === OrganizationClaimMethodEnum.DOMAIN_EMAIL) {
    return OrganizationClaimVerificationLevelEnum.AFFILIATION;
  }
  if (
    method === OrganizationClaimMethodEnum.DNS_TXT
    || method === OrganizationClaimMethodEnum.HTML_META
  ) {
    return OrganizationClaimVerificationLevelEnum.SITE_CONTROL;
  }
  if (method === OrganizationClaimMethodEnum.MANUAL_REVIEW) {
    return OrganizationClaimVerificationLevelEnum.MANUAL_REVIEW;
  }
  return OrganizationClaimVerificationLevelEnum.NONE;
};

const advanceVerifiedClaim = async (
  client: ClaimClient,
  claim: any,
  now: Date,
): Promise<any> => {
  const automaticInitial = claim.requestType === OrganizationClaimRequestTypeEnum.INITIAL_CLAIM;
  return client.organizationClaims.update({
    where: { id: claim.id },
    data: {
      verificationLevel: verificationLevelForMethod(claim.method),
      status: automaticInitial
        ? OrganizationClaimStatusEnum.APPROVED_PENDING_ACCEPTANCE
        : OrganizationClaimStatusEnum.PENDING_MANUAL_REVIEW,
      submittedAt: automaticInitial ? claim.submittedAt : now,
      expiresAt: automaticInitial ? null : addMs(now, MANUAL_CLAIM_TTL_MS),
      updatedAt: now,
    },
  });
};

const sendVerificationEmail = async ({
  email,
  organizationName,
  token,
  organizationId,
  baseUrl,
}: {
  email: string;
  organizationName: string;
  token: string;
  organizationId: string;
  baseUrl?: string | null;
}): Promise<boolean> => {
  if (!isEmailEnabled()) return false;
  const confirmationUrl = absoluteUrl(
    baseUrl,
    `/api/organization-claims/email/confirm?token=${encodeURIComponent(token)}`,
  );
  await sendEmail({
    to: email,
    subject: `Verify your email to claim ${organizationName}`,
    text: [
      `Use this one-time link to verify your organization email for ${organizationName}:`,
      '',
      confirmationUrl,
      '',
      'This link expires in 30 minutes and can only be used by the BracketIQ account that started the claim.',
    ].join('\n'),
    html: [
      `<p>Use this one-time link to verify your organization email for <strong>${organizationName.replace(/[<>&"]/g, '')}</strong>:</p>`,
      `<p><a href="${confirmationUrl}">Verify organization email</a></p>`,
      '<p>This link expires in 30 minutes and can only be used by the BracketIQ account that started the claim.</p>',
    ].join(''),
  });
  return true;
};

const notifyCurrentOwner = async ({
  ownerEmail,
  organizationName,
  requestType,
  organizationId,
  baseUrl,
}: {
  ownerEmail: string | null;
  organizationName: string;
  requestType: OrganizationClaimRequestTypeEnum;
  organizationId: string;
  baseUrl?: string | null;
}): Promise<boolean> => {
  if (!ownerEmail || !isEmailEnabled()) return false;
  const isDispute = requestType === OrganizationClaimRequestTypeEnum.OWNERSHIP_DISPUTE;
  const managementUrl = absoluteUrl(baseUrl, `/organizations/${encodeURIComponent(organizationId)}`);
  await sendEmail({
    to: ownerEmail,
    subject: `${isDispute ? 'Ownership issue reported' : 'Ownership transfer requested'} for ${organizationName}`,
    text: [
      isDispute
        ? `Someone reported an ownership issue for ${organizationName}. BracketIQ administrators will review the request.`
        : `Someone requested ownership transfer for ${organizationName}.`,
      '',
      `Review the organization in BracketIQ: ${managementUrl}`,
      '',
      'Your access and the public claimed status have not changed.',
    ].join('\n'),
  });
  return true;
};

export const getOrganizationClaimPresentation = async (
  organizationId: string,
  viewer: OrganizationClaimActor | null,
  client: ClaimClient = prisma,
): Promise<OrganizationClaimPresentation> => {
  const organization = await client.organizations.findUnique({
    where: { id: organizationId },
    select: {
      id: true,
      name: true,
      website: true,
      originType: true,
      ownershipStatus: true,
      claimVerificationLevel: true,
    },
  });
  if (!organization) {
    throw new OrganizationClaimError('Organization not found.', 'ORGANIZATION_NOT_FOUND', 404);
  }
  const domain = await loadPrimaryDomain(client, organization);
  const viewerClaim = viewer
    ? await client.organizationClaims.findFirst({
        where: {
          organizationId,
          claimantUserId: viewer.userId,
          status: { in: [...ACTIVE_CLAIM_STATUSES] },
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      })
    : null;
  const ownershipAction = viewerClaim
    ? 'VIEW_PENDING_CLAIM'
    : organization.ownershipStatus === OrganizationOwnershipStatusEnum.UNCLAIMED
      ? 'CLAIM'
      : organization.ownershipStatus === OrganizationOwnershipStatusEnum.CLAIMED
        ? 'REPORT_OWNERSHIP_ISSUE'
        : organization.ownershipStatus === OrganizationOwnershipStatusEnum.REVIEW_REQUIRED
          ? 'CONTACT_SUPPORT'
          : 'NONE';
  return {
    organizationId,
    organizationName: organization.name,
    originType: organization.originType,
    ownershipStatus: organization.ownershipStatus,
    claimVerificationLevel: organization.claimVerificationLevel,
    claimable: organization.ownershipStatus === OrganizationOwnershipStatusEnum.UNCLAIMED,
    claimUrl: claimUrlFor(organizationId),
    ownershipAction,
    displayDomain: domain?.policy.registrableDomain ?? null,
    supportedMethods: supportedMethodsForPolicy(domain?.policy ?? null),
    signInRequired: !viewer,
    viewerClaimId: viewerClaim?.id ?? null,
  };
};

export const createOrganizationClaim = async (
  input: CreateOrganizationClaimInput,
  actor: OrganizationClaimActor,
  client: ClaimClient = prisma,
): Promise<OrganizationClaimView> => {
  const now = new Date();
  const organization = await client.organizations.findUnique({
    where: { id: input.organizationId },
    select: {
      id: true,
      name: true,
      ownerId: true,
      website: true,
      originType: true,
      ownershipStatus: true,
    },
  });
  if (!organization) {
    throw new OrganizationClaimError('Organization not found.', 'ORGANIZATION_NOT_FOUND', 404);
  }
  validateRequestTypeForOrganization(organization, input, actor);

  const domain = await loadPrimaryDomain(client, organization);
  const supportedMethods = supportedMethodsForPolicy(domain?.policy ?? null);
  if (!supportedMethods.includes(input.method)) {
    throw new OrganizationClaimError(
      'This verification method is not available for the organization website.',
      'SHARED_PLATFORM_REQUIRES_MANUAL_REVIEW',
      400,
    );
  }

  const verificationEmail = normalizeEmail(input.verificationEmail);
  if (input.method === OrganizationClaimMethodEnum.DOMAIN_EMAIL) {
    if (!verificationEmail || !domain?.policy || !emailMatchesOrganizationDomain(verificationEmail, domain.policy)) {
      throw new OrganizationClaimError(
        'Use an email address on the organization website domain.',
        'DOMAIN_EMAIL_MISMATCH',
        400,
      );
    }
  }

  const roleTitle = normalizeOptional(input.roleTitle, 200);
  const explanation = normalizeOptional(input.explanation, 4000);
  const isDispute = input.requestType === OrganizationClaimRequestTypeEnum.OWNERSHIP_DISPUTE;
  const isManual = input.method === OrganizationClaimMethodEnum.MANUAL_REVIEW;
  if ((isManual || isDispute) && (!roleTitle || !explanation)) {
    throw new OrganizationClaimError(
      'Your role and an explanation are required for review.',
      'ORGANIZATION_CLAIM_REVIEW_DETAILS_REQUIRED',
      400,
    );
  }
  if (isDispute && (!input.issueReason || !input.requestedOutcome || input.certified !== true)) {
    throw new OrganizationClaimError(
      'Choose an issue, requested outcome, and certify the ownership report.',
      'OWNERSHIP_DISPUTE_EVIDENCE_REQUIRED',
      400,
    );
  }

  const existing = await client.organizationClaims.findFirst({
    where: {
      organizationId: input.organizationId,
      claimantUserId: actor.userId,
      status: { in: [...ACTIVE_CLAIM_STATUSES] },
    },
    orderBy: { createdAt: 'desc' },
  });
  if (existing) {
    throw new OrganizationClaimError(
      'You already have a pending request for this organization.',
      isDispute ? 'OWNERSHIP_DISPUTE_ALREADY_PENDING' : 'CLAIM_ALREADY_PENDING',
      409,
    );
  }

  const claimId = createClaimId();
  const evidenceId = input.method === OrganizationClaimMethodEnum.MANUAL_REVIEW
    ? null
    : createEvidenceId();
  const emailSecret = input.method === OrganizationClaimMethodEnum.DOMAIN_EMAIL
    ? randomBytes(32).toString('base64url')
    : null;
  const challengeValue = (
    input.method === OrganizationClaimMethodEnum.DNS_TXT
    || input.method === OrganizationClaimMethodEnum.HTML_META
  ) ? createOrganizationSiteChallengeValue() : null;
  const initialStatus = isManual || isDispute
    ? OrganizationClaimStatusEnum.PENDING_MANUAL_REVIEW
    : OrganizationClaimStatusEnum.PENDING_VERIFICATION;
  const expiresAt = addMs(
    now,
    input.method === OrganizationClaimMethodEnum.DOMAIN_EMAIL
      ? EMAIL_CHALLENGE_TTL_MS
      : input.method === OrganizationClaimMethodEnum.MANUAL_REVIEW || isDispute
        ? MANUAL_CLAIM_TTL_MS
        : SITE_CHALLENGE_TTL_MS,
  );

  const claim = await client.$transaction(async (tx: ClaimClient) => {
    if (input.requestType === OrganizationClaimRequestTypeEnum.INITIAL_CLAIM) {
      const reserved = await tx.organizations.updateMany({
        where: {
          id: input.organizationId,
          ownershipStatus: OrganizationOwnershipStatusEnum.UNCLAIMED,
        },
        data: {
          ownershipStatus: OrganizationOwnershipStatusEnum.CLAIM_PENDING,
          updatedAt: now,
        },
      });
      if (reserved.count !== 1) {
        throw new OrganizationClaimError(
          'Another claim has already started for this organization.',
          'CLAIM_ALREADY_PENDING',
          409,
        );
      }
    }

    const created = await tx.organizationClaims.create({
      data: {
        id: claimId,
        organizationId: input.organizationId,
        claimantUserId: actor.userId,
        requestType: input.requestType,
        status: initialStatus,
        method: input.method,
        verificationLevel: OrganizationClaimVerificationLevelEnum.NONE,
        organizationDomainId: domain?.row?.id ?? null,
        verificationEmail,
        verificationEmailDomain: domain?.policy.registrableDomain ?? null,
        roleTitle,
        explanation,
        publicEvidenceUrl: normalizeOptional(input.publicEvidenceUrl, 2000),
        officialContactName: normalizeOptional(input.officialContactName, 200),
        officialContactEmail: normalizeEmail(input.officialContactEmail),
        officialContactPhone: normalizeOptional(input.officialContactPhone, 100),
        officialContactUrl: normalizeOptional(input.officialContactUrl, 2000),
        submittedAt: initialStatus === OrganizationClaimStatusEnum.PENDING_MANUAL_REVIEW ? now : null,
        expiresAt,
        issueReason: input.issueReason ?? null,
        requestedOutcome: input.requestedOutcome ?? null,
        parentRequestId: normalizeOptional(input.parentRequestId, 200),
        certifiedAt: input.certified === true ? now : null,
        currentOwnerResponseDueAt: isDispute ? addMs(now, CURRENT_OWNER_RESPONSE_TTL_MS) : null,
      },
    });
    if (evidenceId) {
      await tx.organizationClaimEvidence.create({
        data: {
          id: evidenceId,
          claimId,
          method: input.method,
          status: OrganizationClaimEvidenceStatusEnum.PENDING,
          secretHash: emailSecret ? hashValue(emailSecret) : null,
          challengeValue,
          expiresAt,
          metadata: input.method === OrganizationClaimMethodEnum.DOMAIN_EMAIL
            ? {
                intendedEmailHash: hashValue(verificationEmail!),
                sessionVersion: actor.sessionVersion ?? 0,
              }
            : undefined,
        },
      });
    }
    await recordClaimEvent(tx, {
      organizationId: input.organizationId,
      claimId,
      actorUserId: actor.userId,
      eventType: isDispute ? 'OWNERSHIP_DISPUTE_CREATED' : 'ORGANIZATION_CLAIM_CREATED',
      metadata: {
        requestType: input.requestType,
        method: input.method,
        status: initialStatus,
      },
    });
    return created;
  });

  if (emailSecret && evidenceId && verificationEmail) {
    try {
      const sent = await sendVerificationEmail({
        email: verificationEmail,
        organizationName: organization.name,
        token: `${evidenceId}.${emailSecret}`,
        organizationId: organization.id,
        baseUrl: input.baseUrl,
      });
      await recordClaimEventSafe(client, {
        organizationId: organization.id,
        claimId,
        actorUserId: actor.userId,
        eventType: sent ? 'DOMAIN_EMAIL_SENT' : 'DOMAIN_EMAIL_DELIVERY_NOT_CONFIGURED',
      });
    } catch (error) {
      await recordClaimEventSafe(client, {
        organizationId: organization.id,
        claimId,
        actorUserId: actor.userId,
        eventType: 'DOMAIN_EMAIL_DELIVERY_FAILED',
        metadata: { message: error instanceof Error ? error.message.slice(0, 500) : 'Unknown error' },
      });
    }
  }

  const [claimant, owner] = await Promise.all([
    client.authUser.findUnique({
      where: { id: actor.userId },
      select: { email: true },
    }),
    (
      input.requestType === OrganizationClaimRequestTypeEnum.OWNERSHIP_TRANSFER
      || input.requestType === OrganizationClaimRequestTypeEnum.OWNERSHIP_DISPUTE
    )
      ? client.authUser.findUnique({
          where: { id: organization.ownerId },
          select: { email: true },
        })
      : Promise.resolve(null),
  ]);

  await sendAdminOrganizationClaimNotification({
    claim: {
      claimId,
      organizationId: organization.id,
      organizationName: organization.name,
      claimantUserId: actor.userId,
      claimantEmail: claimant?.email ?? null,
      requestType: input.requestType,
      method: input.method,
      status: initialStatus,
      roleTitle,
      explanation,
      issueReason: input.issueReason ?? null,
      requestedOutcome: input.requestedOutcome ?? null,
      createdAt: claim.createdAt,
    },
    baseUrl: input.baseUrl,
  }).then(
    () => recordClaimEventSafe(client, {
      organizationId: organization.id,
      claimId,
      eventType: 'ADMIN_NOTIFICATION_DISPATCHED',
    }),
    (error) => recordClaimEventSafe(client, {
      organizationId: organization.id,
      claimId,
      eventType: 'ADMIN_NOTIFICATION_FAILED',
      metadata: { message: error instanceof Error ? error.message.slice(0, 500) : 'Unknown error' },
    }),
  );

  if (owner) {
    await notifyCurrentOwner({
      ownerEmail: owner.email ?? null,
      organizationName: organization.name,
      requestType: input.requestType,
      organizationId: organization.id,
      baseUrl: input.baseUrl,
    }).then(
      (sent) => sent && client.organizationClaims.update({
        where: { id: claimId },
        data: { currentOwnerNotifiedAt: new Date() },
      }),
      (error) => recordClaimEventSafe(client, {
        organizationId: organization.id,
        claimId,
        eventType: 'CURRENT_OWNER_NOTIFICATION_FAILED',
        metadata: { message: error instanceof Error ? error.message.slice(0, 500) : 'Unknown error' },
      }),
    );
  }

  const refreshed = await client.organizationClaims.findUnique({ where: { id: claimId } });
  return loadClaimView(client, refreshed ?? claim);
};

export const getOrganizationClaim = async (
  organizationId: string,
  claimId: string,
  actor: OrganizationClaimActor,
  client: ClaimClient = prisma,
): Promise<OrganizationClaimView> => {
  const claim = await client.organizationClaims.findFirst({
    where: { id: claimId, organizationId },
  });
  if (!claim) {
    throw new OrganizationClaimError('Claim not found.', 'ORGANIZATION_CLAIM_NOT_FOUND', 404);
  }
  requireClaimActor(claim, actor);
  return loadClaimView(client, claim);
};

export const verifyOrganizationClaim = async (
  input: VerifyOrganizationClaimInput,
  actor: OrganizationClaimActor,
  client: ClaimClient = prisma,
): Promise<OrganizationClaimView> => {
  const claim = await client.organizationClaims.findFirst({
    where: { id: input.claimId, organizationId: input.organizationId },
  });
  if (!claim) {
    throw new OrganizationClaimError('Claim not found.', 'ORGANIZATION_CLAIM_NOT_FOUND', 404);
  }
  requireClaimActor(claim, actor);
  if (claim.method === OrganizationClaimMethodEnum.DOMAIN_EMAIL) {
    throw new OrganizationClaimError(
      'Use the one-time link sent to the organization email.',
      'DOMAIN_EMAIL_CONFIRMATION_REQUIRED',
      400,
    );
  }
  if (
    claim.method !== OrganizationClaimMethodEnum.DNS_TXT
    && claim.method !== OrganizationClaimMethodEnum.HTML_META
  ) {
    throw new OrganizationClaimError(
      'This claim does not have a website challenge.',
      'CLAIM_VERIFICATION_METHOD_INVALID',
      400,
    );
  }
  const evidence = await client.organizationClaimEvidence.findFirst({
    where: { claimId: claim.id, method: claim.method },
    orderBy: { createdAt: 'desc' },
  });
  if (!evidence) {
    throw new OrganizationClaimError('Verification challenge not found.', 'CLAIM_VERIFICATION_NOT_FOUND', 404);
  }
  if (evidence.status === OrganizationClaimEvidenceStatusEnum.VERIFIED) {
    return loadClaimView(client, claim);
  }
  const now = new Date();
  if (!evidence.expiresAt || evidence.expiresAt.getTime() <= now.getTime()) {
    await client.organizationClaimEvidence.update({
      where: { id: evidence.id },
      data: { status: OrganizationClaimEvidenceStatusEnum.EXPIRED, lastCheckedAt: now },
    });
    throw new OrganizationClaimError(
      'The verification challenge has expired.',
      'CLAIM_VERIFICATION_EXPIRED',
      410,
    );
  }

  const organization = await client.organizations.findUnique({
    where: { id: claim.organizationId },
    select: { id: true, website: true },
  });
  const domain = organization ? await loadPrimaryDomain(client, organization) : null;
  if (!domain || !evidence.challengeValue) {
    throw new OrganizationClaimError(
      'The organization does not have an eligible official domain.',
      'ORGANIZATION_DOMAIN_UNAVAILABLE',
      409,
    );
  }
  const result = claim.method === OrganizationClaimMethodEnum.DNS_TXT
    ? await checkOrganizationDnsChallenge({
        registrableDomain: domain.policy.registrableDomain,
        expectedValue: evidence.challengeValue,
        now,
      })
    : await checkOrganizationHtmlChallenge({
        canonicalUrl: domain.policy.canonicalUrl,
        expectedValue: evidence.challengeValue,
        now,
      });

  await client.organizationClaimEvidence.update({
    where: { id: evidence.id },
    data: {
      status: result.verified
        ? OrganizationClaimEvidenceStatusEnum.VERIFIED
        : OrganizationClaimEvidenceStatusEnum.FAILED,
      verifiedAt: result.verified ? now : null,
      lastCheckedAt: now,
      failureReason: result.failureReason,
      metadata: result.metadata,
    },
  });
  await recordClaimEvent(client, {
    organizationId: claim.organizationId,
    claimId: claim.id,
    actorUserId: actor.userId,
    eventType: result.verified ? 'SITE_CHALLENGE_VERIFIED' : 'SITE_CHALLENGE_FAILED',
    metadata: {
      method: claim.method,
      failureReason: result.failureReason,
    },
  });
  if (!result.verified) {
    const current = await client.organizationClaims.findUnique({ where: { id: claim.id } });
    return loadClaimView(client, current ?? claim);
  }
  const advanced = await advanceVerifiedClaim(client, claim, now);
  return loadClaimView(client, advanced);
};

export const confirmOrganizationClaimEmail = async (
  token: string,
  actor: OrganizationClaimActor,
  client: ClaimClient = prisma,
): Promise<OrganizationClaimView> => {
  const separator = token.indexOf('.');
  if (separator <= 0 || separator === token.length - 1) {
    throw new OrganizationClaimError('Invalid verification link.', 'CLAIM_VERIFICATION_INVALID', 400);
  }
  const evidenceId = token.slice(0, separator);
  const secret = token.slice(separator + 1);
  const evidence = await client.organizationClaimEvidence.findUnique({ where: { id: evidenceId } });
  if (!evidence || evidence.method !== OrganizationClaimMethodEnum.DOMAIN_EMAIL || !evidence.secretHash) {
    throw new OrganizationClaimError('Invalid verification link.', 'CLAIM_VERIFICATION_INVALID', 400);
  }
  const claim = await client.organizationClaims.findUnique({ where: { id: evidence.claimId } });
  if (!claim) {
    throw new OrganizationClaimError('Invalid verification link.', 'CLAIM_VERIFICATION_INVALID', 400);
  }
  requireClaimActor(claim, actor);
  if (!safeHashMatches(evidence.secretHash, secret)) {
    throw new OrganizationClaimError('Invalid verification link.', 'CLAIM_VERIFICATION_INVALID', 400);
  }
  const metadata = evidence.metadata && typeof evidence.metadata === 'object'
    ? evidence.metadata as Record<string, unknown>
    : {};
  if (Number(metadata.sessionVersion ?? 0) !== Number(actor.sessionVersion ?? 0)) {
    throw new OrganizationClaimError(
      'This verification link belongs to an earlier session.',
      'CLAIM_VERIFICATION_EXPIRED',
      401,
    );
  }
  if (evidence.status === OrganizationClaimEvidenceStatusEnum.VERIFIED) {
    return loadClaimView(client, claim);
  }
  const now = new Date();
  if (!evidence.expiresAt || evidence.expiresAt.getTime() <= now.getTime()) {
    await client.organizationClaimEvidence.update({
      where: { id: evidence.id },
      data: { status: OrganizationClaimEvidenceStatusEnum.EXPIRED, lastCheckedAt: now },
    });
    throw new OrganizationClaimError(
      'The verification link has expired.',
      'CLAIM_VERIFICATION_EXPIRED',
      410,
    );
  }

  const claimed = await client.organizationClaimEvidence.updateMany({
    where: {
      id: evidence.id,
      status: OrganizationClaimEvidenceStatusEnum.PENDING,
      expiresAt: { gt: now },
    },
    data: {
      status: OrganizationClaimEvidenceStatusEnum.VERIFIED,
      verifiedAt: now,
      lastCheckedAt: now,
      failureReason: null,
    },
  });
  if (claimed.count !== 1) {
    const current = await client.organizationClaimEvidence.findUnique({ where: { id: evidence.id } });
    if (current?.status !== OrganizationClaimEvidenceStatusEnum.VERIFIED) {
      throw new OrganizationClaimError(
        'The verification link has already been used.',
        'CLAIM_VERIFICATION_ALREADY_USED',
        409,
      );
    }
  }
  const advanced = await advanceVerifiedClaim(client, claim, now);
  await recordClaimEvent(client, {
    organizationId: claim.organizationId,
    claimId: claim.id,
    actorUserId: actor.userId,
    eventType: 'DOMAIN_EMAIL_VERIFIED',
  });
  return loadClaimView(client, advanced);
};

export const cancelOrganizationClaim = async (
  organizationId: string,
  claimId: string,
  actor: OrganizationClaimActor,
  client: ClaimClient = prisma,
): Promise<OrganizationClaimView> => {
  const claim = await client.organizationClaims.findFirst({
    where: { id: claimId, organizationId },
  });
  if (!claim) {
    throw new OrganizationClaimError('Claim not found.', 'ORGANIZATION_CLAIM_NOT_FOUND', 404);
  }
  requireClaimActor(claim, actor);
  if (claim.status === OrganizationClaimStatusEnum.DISPUTED) {
    throw new OrganizationClaimError(
      'A credible ownership dispute can only be closed by an administrator.',
      'OWNERSHIP_DISPUTE_ADMIN_REVIEW_REQUIRED',
      409,
    );
  }
  if (!ACTIVE_CLAIM_STATUSES.includes(claim.status)) {
    return loadClaimView(client, claim);
  }
  const now = new Date();
  const updated = await client.$transaction(async (tx: ClaimClient) => {
    const cancelled = await tx.organizationClaims.update({
      where: { id: claim.id },
      data: { status: OrganizationClaimStatusEnum.CANCELLED, updatedAt: now },
    });
    await tx.organizationClaimEvidence.updateMany({
      where: { claimId: claim.id, status: OrganizationClaimEvidenceStatusEnum.PENDING },
      data: { status: OrganizationClaimEvidenceStatusEnum.REVOKED, updatedAt: now },
    });
    if (claim.requestType === OrganizationClaimRequestTypeEnum.INITIAL_CLAIM) {
      await tx.organizations.updateMany({
        where: {
          id: organizationId,
          ownershipStatus: OrganizationOwnershipStatusEnum.CLAIM_PENDING,
        },
        data: { ownershipStatus: OrganizationOwnershipStatusEnum.UNCLAIMED, updatedAt: now },
      });
    }
    await recordClaimEvent(tx, {
      organizationId,
      claimId,
      actorUserId: actor.userId,
      eventType: 'ORGANIZATION_CLAIM_CANCELLED',
    });
    return cancelled;
  });
  return loadClaimView(client, updated);
};

export const submitOrganizationClaim = async (
  organizationId: string,
  claimId: string,
  actor: OrganizationClaimActor,
  input: {
    roleTitle?: string | null;
    explanation?: string | null;
    publicEvidenceUrl?: string | null;
    officialContactName?: string | null;
    officialContactEmail?: string | null;
    officialContactPhone?: string | null;
    officialContactUrl?: string | null;
    certified?: boolean;
  },
  client: ClaimClient = prisma,
): Promise<OrganizationClaimView> => {
  const claim = await client.organizationClaims.findFirst({
    where: { id: claimId, organizationId },
  });
  if (!claim) {
    throw new OrganizationClaimError('Claim not found.', 'ORGANIZATION_CLAIM_NOT_FOUND', 404);
  }
  requireClaimActor(claim, actor);
  if (claim.status !== OrganizationClaimStatusEnum.PENDING_MANUAL_REVIEW) {
    throw new OrganizationClaimError(
      'This claim is not awaiting manual-review submission.',
      'ORGANIZATION_CLAIM_NOT_SUBMITTABLE',
      409,
    );
  }
  const roleTitle = normalizeOptional(input.roleTitle ?? claim.roleTitle, 200);
  const explanation = normalizeOptional(input.explanation ?? claim.explanation, 4000);
  if (!roleTitle || !explanation) {
    throw new OrganizationClaimError(
      'Your role and an explanation are required for review.',
      'ORGANIZATION_CLAIM_REVIEW_DETAILS_REQUIRED',
      400,
    );
  }
  if (
    claim.requestType === OrganizationClaimRequestTypeEnum.OWNERSHIP_DISPUTE
    && !claim.certifiedAt
    && input.certified !== true
  ) {
    throw new OrganizationClaimError(
      'Certify the ownership report before submitting it.',
      'OWNERSHIP_DISPUTE_EVIDENCE_REQUIRED',
      400,
    );
  }
  const now = new Date();
  const updated = await client.organizationClaims.update({
    where: { id: claim.id },
    data: {
      roleTitle,
      explanation,
      publicEvidenceUrl: normalizeOptional(input.publicEvidenceUrl ?? claim.publicEvidenceUrl, 2000),
      officialContactName: normalizeOptional(input.officialContactName ?? claim.officialContactName, 200),
      officialContactEmail: normalizeEmail(input.officialContactEmail ?? claim.officialContactEmail),
      officialContactPhone: normalizeOptional(input.officialContactPhone ?? claim.officialContactPhone, 100),
      officialContactUrl: normalizeOptional(input.officialContactUrl ?? claim.officialContactUrl, 2000),
      submittedAt: claim.submittedAt ?? now,
      certifiedAt: claim.certifiedAt ?? (input.certified === true ? now : null),
      expiresAt: addMs(now, MANUAL_CLAIM_TTL_MS),
      updatedAt: now,
    },
  });
  await recordClaimEvent(client, {
    organizationId,
    claimId,
    actorUserId: actor.userId,
    eventType: 'ORGANIZATION_CLAIM_SUBMITTED',
  });
  return loadClaimView(client, updated);
};

export const decideOrganizationClaim = async (
  input: DecideOrganizationClaimInput,
  admin: { userId: string; adminEmail: string },
  client: ClaimClient = prisma,
): Promise<OrganizationClaimView> => {
  const claim = await client.organizationClaims.findUnique({ where: { id: input.claimId } });
  if (!claim) {
    throw new OrganizationClaimError('Claim not found.', 'ORGANIZATION_CLAIM_NOT_FOUND', 404);
  }
  const message = normalizeOptional(input.userDecisionMessage, 2000);
  if (!message) {
    throw new OrganizationClaimError(
      'A user-facing decision message is required.',
      'CLAIM_DECISION_MESSAGE_REQUIRED',
      400,
    );
  }
  const now = new Date();
  let nextStatus = claim.status;
  let resolution = input.resolution ?? claim.resolution;
  if (input.action === 'APPROVE') {
    if (claim.requestType === OrganizationClaimRequestTypeEnum.OWNERSHIP_DISPUTE) {
      throw new OrganizationClaimError(
        'Resolve an ownership dispute with an explicit resolution.',
        'OWNERSHIP_DISPUTE_RESOLUTION_REQUIRED',
        400,
      );
    }
    nextStatus = OrganizationClaimStatusEnum.APPROVED_PENDING_ACCEPTANCE;
  } else if (input.action === 'REJECT') {
    nextStatus = OrganizationClaimStatusEnum.REJECTED;
  } else if (input.action === 'MARK_DISPUTED') {
    nextStatus = OrganizationClaimStatusEnum.DISPUTED;
  } else if (input.action === 'REVOKE') {
    nextStatus = OrganizationClaimStatusEnum.REVOKED;
  } else if (input.action === 'RESTORE') {
    nextStatus = OrganizationClaimStatusEnum.APPROVED_PENDING_ACCEPTANCE;
  } else if (input.action === 'RESOLVE') {
    if (!input.resolution) {
      throw new OrganizationClaimError(
        'A dispute resolution is required.',
        'OWNERSHIP_DISPUTE_RESOLUTION_REQUIRED',
        400,
      );
    }
    resolution = input.resolution;
    nextStatus = input.resolution === OrganizationOwnershipResolutionEnum.INITIATE_OWNERSHIP_TRANSFER
      ? OrganizationClaimStatusEnum.APPROVED_PENDING_ACCEPTANCE
      : OrganizationClaimStatusEnum.REJECTED;
  }
  const verificationLevel = input.verificationLevel
    ?? (claim.verificationLevel === OrganizationClaimVerificationLevelEnum.NONE
      ? OrganizationClaimVerificationLevelEnum.MANUAL_REVIEW
      : claim.verificationLevel);
  const updated = await client.$transaction(async (tx: ClaimClient) => {
    const decided = await tx.organizationClaims.update({
      where: { id: claim.id },
      data: {
        status: nextStatus,
        verificationLevel,
        resolution,
        decidedAt: now,
        decidedByUserId: admin.userId,
        internalDecisionNotes: normalizeOptional(input.internalDecisionNotes, 4000),
        userDecisionMessage: message,
        credibilityDecidedAt: input.action === 'MARK_DISPUTED' ? now : claim.credibilityDecidedAt,
        credibilityDecidedByUserId: input.action === 'MARK_DISPUTED' ? admin.userId : claim.credibilityDecidedByUserId,
        updatedAt: now,
      },
    });
    if (input.action === 'MARK_DISPUTED') {
      await tx.organizations.update({
        where: { id: claim.organizationId },
        data: { ownershipStatus: OrganizationOwnershipStatusEnum.DISPUTED, updatedAt: now },
      });
    } else if (input.action === 'RESOLVE' && resolution) {
      if (resolution === OrganizationOwnershipResolutionEnum.UPHOLD_CURRENT_OWNER) {
        await tx.organizations.update({
          where: { id: claim.organizationId },
          data: { ownershipStatus: OrganizationOwnershipStatusEnum.CLAIMED, updatedAt: now },
        });
      } else if (resolution === OrganizationOwnershipResolutionEnum.REVOKE_TO_UNCLAIMED) {
        await tx.organizations.update({
          where: { id: claim.organizationId },
          data: {
            ownerId: admin.userId,
            ownershipStatus: OrganizationOwnershipStatusEnum.UNCLAIMED,
            claimedAt: null,
            claimedByUserId: null,
            claimVerificationLevel: OrganizationClaimVerificationLevelEnum.NONE,
            ownershipVerifiedAt: null,
            ownershipVerificationLastCheckedAt: null,
            updatedAt: now,
          },
        });
      } else if (resolution === OrganizationOwnershipResolutionEnum.SUSPEND_OWNER_ACCESS) {
        await tx.organizations.update({
          where: { id: claim.organizationId },
          data: {
            ownerId: admin.userId,
            ownershipStatus: OrganizationOwnershipStatusEnum.SUSPENDED,
            updatedAt: now,
          },
        });
      } else if (resolution === OrganizationOwnershipResolutionEnum.MERGE_OR_CORRECT_PROFILE) {
        await tx.organizations.update({
          where: { id: claim.organizationId },
          data: { ownershipStatus: OrganizationOwnershipStatusEnum.CLAIMED, updatedAt: now },
        });
      }
    } else if (input.action === 'REVOKE') {
      if (claim.requestType === OrganizationClaimRequestTypeEnum.INITIAL_CLAIM) {
        await tx.organizations.updateMany({
          where: { id: claim.organizationId },
          data: {
            ownerId: admin.userId,
            ownershipStatus: OrganizationOwnershipStatusEnum.UNCLAIMED,
            claimedAt: null,
            claimedByUserId: null,
            claimVerificationLevel: OrganizationClaimVerificationLevelEnum.NONE,
            ownershipVerifiedAt: null,
            ownershipVerificationLastCheckedAt: null,
            updatedAt: now,
          },
        });
      } else {
        await tx.organizations.update({
          where: { id: claim.organizationId },
          data: {
            ownerId: admin.userId,
            ownershipStatus: OrganizationOwnershipStatusEnum.SUSPENDED,
            updatedAt: now,
          },
        });
      }
    } else if (
      input.action === 'REJECT'
      && claim.requestType === OrganizationClaimRequestTypeEnum.INITIAL_CLAIM
    ) {
      await tx.organizations.updateMany({
        where: {
          id: claim.organizationId,
          ownershipStatus: OrganizationOwnershipStatusEnum.CLAIM_PENDING,
        },
        data: { ownershipStatus: OrganizationOwnershipStatusEnum.UNCLAIMED, updatedAt: now },
      });
    }
    await recordClaimEvent(tx, {
      organizationId: claim.organizationId,
      claimId: claim.id,
      actorUserId: admin.userId,
      eventType: `ADMIN_${input.action}`,
      metadata: {
        adminEmail: admin.adminEmail,
        resolution,
        verificationLevel,
      },
    });
    return decided;
  });
  return loadClaimView(client, updated);
};

export const reconcileOrganizationReviewConflicts = async (
  organizationId: string,
  client: ClaimClient = prisma,
): Promise<{ hiddenReviewIds: string[] }> => {
  const [organization, staff] = await Promise.all([
    client.organizations.findUnique({
      where: { id: organizationId },
      select: { ownerId: true },
    }),
    client.staffMembers.findMany({
      where: { organizationId },
      select: { userId: true },
    }),
  ]);
  if (!organization) return { hiddenReviewIds: [] };
  const conflictedUserIds = Array.from(new Set([
    organization.ownerId,
    ...staff.map((row: { userId: string }) => row.userId),
  ]));
  const reviews = await client.organizationReviews.findMany({
    where: {
      organizationId,
      reviewerUserId: { in: conflictedUserIds },
      status: 'PUBLISHED',
    },
    select: { id: true },
  });
  if (!reviews.length) return { hiddenReviewIds: [] };
  const now = new Date();
  await client.organizationReviews.updateMany({
    where: { id: { in: reviews.map((review: { id: string }) => review.id) } },
    data: {
      status: 'HIDDEN',
      hiddenAt: now,
      hiddenReason: 'OWNER_OR_STAFF_CONFLICT',
      updatedAt: now,
    },
  });
  return { hiddenReviewIds: reviews.map((review: { id: string }) => review.id) };
};

export const acceptOrganizationClaim = async (
  input: AcceptOrganizationClaimInput,
  actor: OrganizationClaimActor,
  client: ClaimClient = prisma,
): Promise<OrganizationClaimView> => {
  if (input.mfaConfirmed !== true) {
    throw new OrganizationClaimError(
      'Authenticator verification is required.',
      'MFA_REQUIRED_FOR_ORGANIZATION_CLAIM',
      403,
    );
  }
  const now = new Date();
  const accepted = await client.$transaction(async (tx: ClaimClient) => {
    const claim = await tx.organizationClaims.findFirst({
      where: { id: input.claimId, organizationId: input.organizationId },
    });
    if (!claim) {
      throw new OrganizationClaimError('Claim not found.', 'ORGANIZATION_CLAIM_NOT_FOUND', 404);
    }
    requireClaimActor(claim, actor);
    if (claim.status === OrganizationClaimStatusEnum.APPROVED) return claim;
    if (claim.status !== OrganizationClaimStatusEnum.APPROVED_PENDING_ACCEPTANCE) {
      throw new OrganizationClaimError(
        'This claim is not ready for acceptance.',
        'ORGANIZATION_CLAIM_NOT_APPROVED',
        409,
      );
    }
    const organization = await tx.organizations.findUnique({
      where: { id: input.organizationId },
      select: { id: true, ownerId: true, ownershipStatus: true },
    });
    if (!organization) {
      throw new OrganizationClaimError('Organization not found.', 'ORGANIZATION_NOT_FOUND', 404);
    }
    if (
      claim.requestType === OrganizationClaimRequestTypeEnum.OWNERSHIP_TRANSFER
      && !claim.currentOwnerApprovedAt
      && claim.resolution !== OrganizationOwnershipResolutionEnum.INITIATE_OWNERSHIP_TRANSFER
    ) {
      throw new OrganizationClaimError(
        'The current owner must approve this transfer.',
        'CURRENT_OWNER_APPROVAL_REQUIRED',
        409,
      );
    }
    if (
      claim.requestType === OrganizationClaimRequestTypeEnum.OWNERSHIP_DISPUTE
      && claim.resolution !== OrganizationOwnershipResolutionEnum.INITIATE_OWNERSHIP_TRANSFER
    ) {
      throw new OrganizationClaimError(
        'An administrator must explicitly initiate transfer when resolving a dispute.',
        'OWNERSHIP_DISPUTE_TRANSFER_NOT_APPROVED',
        409,
      );
    }

    const claimUpdate = await tx.organizationClaims.updateMany({
      where: {
        id: claim.id,
        claimantUserId: actor.userId,
        status: OrganizationClaimStatusEnum.APPROVED_PENDING_ACCEPTANCE,
      },
      data: {
        status: OrganizationClaimStatusEnum.APPROVED,
        acceptedAt: now,
        updatedAt: now,
      },
    });
    if (claimUpdate.count !== 1) {
      throw new OrganizationClaimError(
        'This claim was already accepted or changed.',
        'ORGANIZATION_CLAIM_STATE_CHANGED',
        409,
      );
    }

    const organizationWhere = claim.requestType === OrganizationClaimRequestTypeEnum.INITIAL_CLAIM
      ? {
          id: organization.id,
          ownershipStatus: OrganizationOwnershipStatusEnum.CLAIM_PENDING,
        }
      : {
          id: organization.id,
          ownerId: organization.ownerId,
          ownershipStatus: {
            in: [
              OrganizationOwnershipStatusEnum.CLAIMED,
              OrganizationOwnershipStatusEnum.DISPUTED,
            ],
          },
        };
    const organizationUpdate = await tx.organizations.updateMany({
      where: organizationWhere,
      data: {
        ownerId: actor.userId,
        ownershipStatus: OrganizationOwnershipStatusEnum.CLAIMED,
        claimedAt: now,
        claimedByUserId: actor.userId,
        claimVerificationLevel: claim.verificationLevel,
        ownershipVerifiedAt: now,
        ownershipVerificationLastCheckedAt: now,
        updatedAt: now,
      },
    });
    if (organizationUpdate.count !== 1) {
      throw new OrganizationClaimError(
        'Organization ownership changed while this claim was being accepted.',
        'ORGANIZATION_OWNERSHIP_CHANGED',
        409,
      );
    }
    if (claim.verificationLevel === OrganizationClaimVerificationLevelEnum.SITE_CONTROL) {
      await tx.organizationDomains.updateMany({
        where: { organizationId: organization.id, isPrimary: true },
        data: { verifiedAt: now, lastCheckedAt: now, updatedAt: now },
      });
    }
    await tx.organizationClaims.updateMany({
      where: {
        organizationId: organization.id,
        id: { not: claim.id },
        status: { in: [...ACTIVE_CLAIM_STATUSES] },
      },
      data: {
        status: OrganizationClaimStatusEnum.EXPIRED,
        userDecisionMessage: 'Another ownership request was completed.',
        updatedAt: now,
      },
    });
    await ensureDefaultOrganizationRoles(tx, organization.id);
    await recordClaimEvent(tx, {
      organizationId: organization.id,
      claimId: claim.id,
      actorUserId: actor.userId,
      eventType: 'ORGANIZATION_CLAIM_ACCEPTED',
      metadata: {
        previousOwnerId: organization.ownerId,
        verificationLevel: claim.verificationLevel,
      },
    });
    return { ...claim, status: OrganizationClaimStatusEnum.APPROVED, acceptedAt: now, updatedAt: now };
  });

  await reconcileOrganizationReviewConflicts(input.organizationId, client);
  const refreshed = await client.organizationClaims.findUnique({ where: { id: input.claimId } });
  return loadClaimView(client, refreshed ?? accepted);
};

export const approveOwnershipTransferByCurrentOwner = async (
  organizationId: string,
  claimId: string,
  owner: OrganizationClaimActor,
  client: ClaimClient = prisma,
): Promise<OrganizationClaimView> => {
  const [organization, claim] = await Promise.all([
    client.organizations.findUnique({
      where: { id: organizationId },
      select: { id: true, ownerId: true },
    }),
    client.organizationClaims.findFirst({
      where: { id: claimId, organizationId },
    }),
  ]);
  if (!organization || !claim) {
    throw new OrganizationClaimError('Ownership request not found.', 'OWNERSHIP_REQUEST_NOT_FOUND', 404);
  }
  if (organization.ownerId !== owner.userId) {
    throw new OrganizationClaimError('Forbidden.', 'FORBIDDEN', 403);
  }
  if (claim.requestType !== OrganizationClaimRequestTypeEnum.OWNERSHIP_TRANSFER) {
    throw new OrganizationClaimError(
      'Only ownership-transfer requests can be approved by the current owner.',
      'OWNERSHIP_REQUEST_TYPE_INVALID',
      400,
    );
  }
  if (
    claim.status !== OrganizationClaimStatusEnum.PENDING_MANUAL_REVIEW
    && claim.status !== OrganizationClaimStatusEnum.PENDING_VERIFICATION
  ) {
    throw new OrganizationClaimError(
      'This ownership transfer cannot be approved in its current state.',
      'OWNERSHIP_REQUEST_STATE_INVALID',
      409,
    );
  }
  if (
    claim.method !== OrganizationClaimMethodEnum.MANUAL_REVIEW
    && claim.verificationLevel === OrganizationClaimVerificationLevelEnum.NONE
  ) {
    throw new OrganizationClaimError(
      'The requester must complete organization verification first.',
      'CLAIM_VERIFICATION_REQUIRED',
      409,
    );
  }
  const now = new Date();
  const updated = await client.organizationClaims.update({
    where: { id: claim.id },
    data: {
      currentOwnerApprovedAt: now,
      currentOwnerApprovedByUserId: owner.userId,
      status: OrganizationClaimStatusEnum.APPROVED_PENDING_ACCEPTANCE,
      userDecisionMessage: 'The current owner approved this ownership transfer.',
      updatedAt: now,
    },
  });
  await recordClaimEvent(client, {
    organizationId,
    claimId,
    actorUserId: owner.userId,
    eventType: 'CURRENT_OWNER_APPROVED_TRANSFER',
  });
  return loadClaimView(client, updated);
};

export const respondToOwnershipRequest = async (
  organizationId: string,
  claimId: string,
  owner: OrganizationClaimActor,
  input: {
    action: 'DENY' | 'RESPOND';
    message: string;
    publicEvidenceUrl?: string | null;
  },
  client: ClaimClient = prisma,
): Promise<OrganizationClaimView> => {
  const [organization, claim] = await Promise.all([
    client.organizations.findUnique({
      where: { id: organizationId },
      select: { id: true, ownerId: true },
    }),
    client.organizationClaims.findFirst({
      where: { id: claimId, organizationId },
    }),
  ]);
  if (!organization || !claim) {
    throw new OrganizationClaimError('Ownership request not found.', 'OWNERSHIP_REQUEST_NOT_FOUND', 404);
  }
  if (!owner.isAdmin && organization.ownerId !== owner.userId) {
    throw new OrganizationClaimError('Forbidden.', 'FORBIDDEN', 403);
  }
  const message = normalizeOptional(input.message, 4000);
  if (!message) {
    throw new OrganizationClaimError(
      'A response message is required.',
      'OWNERSHIP_RESPONSE_REQUIRED',
      400,
    );
  }
  const now = new Date();
  if (
    claim.currentOwnerResponseDueAt
    && claim.currentOwnerResponseDueAt.getTime() < now.getTime()
    && claim.requestType === OrganizationClaimRequestTypeEnum.OWNERSHIP_DISPUTE
  ) {
    throw new OrganizationClaimError(
      'The ownership response window has closed.',
      'OWNERSHIP_DISPUTE_RESPONSE_CLOSED',
      409,
    );
  }
  const updated = await client.organizationClaims.update({
    where: { id: claim.id },
    data: input.action === 'DENY'
      ? {
          status: OrganizationClaimStatusEnum.REJECTED,
          currentOwnerRespondedAt: now,
          currentOwnerResponse: message,
          currentOwnerPublicEvidenceUrl: normalizeOptional(input.publicEvidenceUrl, 2000),
          userDecisionMessage: message,
          decidedAt: now,
          decidedByUserId: owner.userId,
          updatedAt: now,
        }
      : {
          currentOwnerRespondedAt: now,
          currentOwnerResponse: message,
          currentOwnerPublicEvidenceUrl: normalizeOptional(input.publicEvidenceUrl, 2000),
          updatedAt: now,
        },
  });
  await recordClaimEvent(client, {
    organizationId,
    claimId,
    actorUserId: owner.userId,
    eventType: input.action === 'DENY'
      ? 'CURRENT_OWNER_DENIED_TRANSFER'
      : 'CURRENT_OWNER_RESPONDED_TO_DISPUTE',
  });
  return loadClaimView(client, updated);
};
