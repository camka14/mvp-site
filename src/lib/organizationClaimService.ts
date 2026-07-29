'use client';

import { apiRequest } from '@/lib/apiClient';
import type {
  OrganizationClaimVerificationLevel,
  OrganizationOriginType,
  OrganizationOwnershipAction,
  OrganizationOwnershipStatus,
} from '@/types';

export type OrganizationClaimMethod =
  | 'DOMAIN_EMAIL'
  | 'DNS_TXT'
  | 'HTML_META'
  | 'MANUAL_REVIEW';
export type OrganizationClaimRequestType =
  | 'INITIAL_CLAIM'
  | 'OWNERSHIP_TRANSFER'
  | 'OWNERSHIP_DISPUTE'
  | 'DUPLICATE_PROFILE_REVIEW';
export type OrganizationClaimStatus =
  | 'PENDING_VERIFICATION'
  | 'PENDING_MANUAL_REVIEW'
  | 'APPROVED_PENDING_ACCEPTANCE'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'DISPUTED'
  | 'REVOKED'
  | 'EXPIRED';
export type OrganizationOwnershipIssueReason =
  | 'FORMER_REPRESENTATIVE'
  | 'OWNER_UNAVAILABLE'
  | 'UNAUTHORIZED_OR_MISLEADING_CLAIM'
  | 'DUPLICATE_OR_INCORRECT_PROFILE'
  | 'OTHER';
export type OrganizationOwnershipRequestedOutcome =
  | 'OWNERSHIP_TRANSFER'
  | 'REVIEW_OR_REVOKE_CLAIM'
  | 'MERGE_OR_CORRECT_PROFILE';

export type OrganizationClaimPresentation = {
  organizationId: string;
  organizationName: string;
  originType: OrganizationOriginType;
  ownershipStatus: OrganizationOwnershipStatus;
  claimVerificationLevel: OrganizationClaimVerificationLevel;
  claimable: boolean;
  claimUrl: string;
  ownershipAction: OrganizationOwnershipAction;
  displayDomain: string | null;
  supportedMethods: OrganizationClaimMethod[];
  signInRequired: boolean;
  viewerClaimId: string | null;
};

export type OrganizationClaimEvidence = {
  id: string;
  method: OrganizationClaimMethod;
  status: 'PENDING' | 'VERIFIED' | 'FAILED' | 'EXPIRED' | 'REVOKED';
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

export type OrganizationClaim = {
  id: string;
  organizationId: string;
  claimantUserId: string;
  requestType: OrganizationClaimRequestType;
  status: OrganizationClaimStatus;
  method: OrganizationClaimMethod;
  verificationLevel: OrganizationClaimVerificationLevel;
  verificationEmail: string | null;
  roleTitle: string | null;
  explanation: string | null;
  publicEvidenceUrl: string | null;
  issueReason: OrganizationOwnershipIssueReason | null;
  requestedOutcome: OrganizationOwnershipRequestedOutcome | null;
  submittedAt: string | null;
  expiresAt: string | null;
  decidedAt: string | null;
  userDecisionMessage: string | null;
  acceptedAt: string | null;
  createdAt: string;
  updatedAt: string;
  evidence: OrganizationClaimEvidence[];
};

export type CreateOrganizationClaimInput = {
  requestType: OrganizationClaimRequestType;
  method: OrganizationClaimMethod;
  verificationEmail?: string | null;
  roleTitle?: string | null;
  explanation?: string | null;
  publicEvidenceUrl?: string | null;
  officialContactName?: string | null;
  officialContactEmail?: string | null;
  officialContactPhone?: string | null;
  officialContactUrl?: string | null;
  issueReason?: OrganizationOwnershipIssueReason | null;
  requestedOutcome?: OrganizationOwnershipRequestedOutcome | null;
  certified?: boolean;
};

const claimBasePath = (organizationId: string): string => (
  `/api/organizations/${encodeURIComponent(organizationId)}`
);

export const organizationClaimService = {
  async getPresentation(organizationId: string): Promise<OrganizationClaimPresentation> {
    const response = await apiRequest<{ claim: OrganizationClaimPresentation }>(
      `${claimBasePath(organizationId)}/claim`,
    );
    return response.claim;
  },

  async getClaim(organizationId: string, claimId: string): Promise<OrganizationClaim> {
    const response = await apiRequest<{ claim: OrganizationClaim }>(
      `${claimBasePath(organizationId)}/claims/${encodeURIComponent(claimId)}`,
    );
    return response.claim;
  },

  async createClaim(
    organizationId: string,
    input: CreateOrganizationClaimInput,
  ): Promise<OrganizationClaim> {
    const response = await apiRequest<{ claim: OrganizationClaim }>(
      `${claimBasePath(organizationId)}/claims`,
      { method: 'POST', body: input },
    );
    return response.claim;
  },

  async verifyClaim(organizationId: string, claimId: string): Promise<OrganizationClaim> {
    const response = await apiRequest<{ claim: OrganizationClaim }>(
      `${claimBasePath(organizationId)}/claims/${encodeURIComponent(claimId)}/verify`,
      { method: 'POST' },
    );
    return response.claim;
  },

  async submitClaim(
    organizationId: string,
    claimId: string,
    input: Omit<CreateOrganizationClaimInput, 'requestType' | 'method'>,
  ): Promise<OrganizationClaim> {
    const response = await apiRequest<{ claim: OrganizationClaim }>(
      `${claimBasePath(organizationId)}/claims/${encodeURIComponent(claimId)}/submit`,
      { method: 'POST', body: input },
    );
    return response.claim;
  },

  async cancelClaim(organizationId: string, claimId: string): Promise<OrganizationClaim> {
    const response = await apiRequest<{ claim: OrganizationClaim }>(
      `${claimBasePath(organizationId)}/claims/${encodeURIComponent(claimId)}/cancel`,
      { method: 'POST' },
    );
    return response.claim;
  },

  async startMfa(
    organizationId: string,
    claimId: string,
  ): Promise<{ challengeId: string; expiresAt?: string }> {
    const response = await apiRequest<{
      code: string;
      mfa: { challengeId: string; expiresAt?: string };
    }>(
      `${claimBasePath(organizationId)}/claims/${encodeURIComponent(claimId)}/mfa/start`,
      { method: 'POST' },
    );
    return response.mfa;
  },

  async confirmMfa(
    organizationId: string,
    claimId: string,
    input: { challengeId: string; code: string },
  ): Promise<OrganizationClaim> {
    const response = await apiRequest<{ claim: OrganizationClaim }>(
      `${claimBasePath(organizationId)}/claims/${encodeURIComponent(claimId)}/mfa/confirm`,
      { method: 'POST', body: input },
    );
    return response.claim;
  },
};
