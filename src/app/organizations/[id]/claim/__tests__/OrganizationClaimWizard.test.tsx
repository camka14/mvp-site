import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithMantine } from '../../../../../../test/utils/renderWithMantine';

import OrganizationClaimWizard from '../OrganizationClaimWizard';

const replaceMock = jest.fn();
const getPresentationMock = jest.fn();
const getClaimMock = jest.fn();
const createClaimMock = jest.fn();
const verifyClaimMock = jest.fn();
const cancelClaimMock = jest.fn();
const startMfaMock = jest.fn();
const confirmMfaMock = jest.fn();
let queryParams = new URLSearchParams();
let currentUser: Record<string, unknown> | null = { $id: 'user-1' };

jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'org-1' }),
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => queryParams,
}));

jest.mock('@/app/providers', () => ({
  useApp: () => ({ user: currentUser, loading: false }),
}));

jest.mock('@/components/layout/Navigation', () => ({
  __esModule: true,
  default: () => <nav>Navigation</nav>,
}));

jest.mock('@/lib/organizationClaimService', () => ({
  organizationClaimService: {
    getPresentation: (...args: unknown[]) => getPresentationMock(...args),
    getClaim: (...args: unknown[]) => getClaimMock(...args),
    createClaim: (...args: unknown[]) => createClaimMock(...args),
    verifyClaim: (...args: unknown[]) => verifyClaimMock(...args),
    cancelClaim: (...args: unknown[]) => cancelClaimMock(...args),
    startMfa: (...args: unknown[]) => startMfaMock(...args),
    confirmMfa: (...args: unknown[]) => confirmMfaMock(...args),
  },
}));

const unclaimedPresentation = {
  organizationId: 'org-1',
  organizationName: 'River City Sports Club',
  originType: 'AFFILIATE_IMPORTED',
  ownershipStatus: 'UNCLAIMED',
  claimVerificationLevel: 'NONE',
  claimable: true,
  claimUrl: '/organizations/org-1/claim',
  ownershipAction: 'CLAIM',
  displayDomain: 'rivercitysports.org',
  supportedMethods: ['DOMAIN_EMAIL', 'DNS_TXT', 'HTML_META', 'MANUAL_REVIEW'],
  signInRequired: false,
  viewerClaimId: null,
};

const pendingEmailClaim = {
  id: 'claim-1',
  organizationId: 'org-1',
  claimantUserId: 'user-1',
  requestType: 'INITIAL_CLAIM',
  status: 'PENDING_VERIFICATION',
  method: 'DOMAIN_EMAIL',
  verificationLevel: 'NONE',
  verificationEmail: 'owner@rivercitysports.org',
  roleTitle: null,
  explanation: null,
  publicEvidenceUrl: null,
  issueReason: null,
  requestedOutcome: null,
  submittedAt: null,
  expiresAt: '2026-07-30T20:00:00.000Z',
  decidedAt: null,
  userDecisionMessage: null,
  acceptedAt: null,
  createdAt: '2026-07-29T20:00:00.000Z',
  updatedAt: '2026-07-29T20:00:00.000Z',
  evidence: [],
};

describe('OrganizationClaimWizard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryParams = new URLSearchParams();
    currentUser = { $id: 'user-1' };
    getPresentationMock.mockResolvedValue(unclaimedPresentation);
    createClaimMock.mockResolvedValue(pendingEmailClaim);
  });

  it('starts an unclaimed profile claim with a domain email', async () => {
    const user = userEvent.setup();
    renderWithMantine(<OrganizationClaimWizard />);

    expect(await screen.findByRole('heading', { name: 'River City Sports Club' })).toBeInTheDocument();
    await user.click(screen.getByText('Email at the organization domain'));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.type(screen.getByRole('textbox', { name: /Organization email/ }), 'owner@rivercitysports.org');
    await user.click(screen.getByRole('button', { name: 'Start verification' }));

    await waitFor(() => {
      expect(createClaimMock).toHaveBeenCalledWith('org-1', expect.objectContaining({
        requestType: 'INITIAL_CLAIM',
        method: 'DOMAIN_EMAIL',
        verificationEmail: 'owner@rivercitysports.org',
      }));
    });
    expect(await screen.findByRole('heading', { name: 'Check your organization email' })).toBeInTheDocument();
    expect(replaceMock).toHaveBeenCalledWith('/organizations/org-1/claim?claimId=claim-1');
  });

  it('routes an already claimed profile to transfer or dispute without staff access requests', async () => {
    getPresentationMock.mockResolvedValue({
      ...unclaimedPresentation,
      ownershipStatus: 'CLAIMED',
      claimVerificationLevel: 'SITE_CONTROL',
      claimable: false,
      ownershipAction: 'REPORT_OWNERSHIP_ISSUE',
    });
    renderWithMantine(<OrganizationClaimWizard />);

    expect(await screen.findByRole('heading', { name: 'How can we help?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Request ownership transfer' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Report an ownership issue' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /staff/i })).not.toBeInTheDocument();
    expect(screen.getByText(/staff access is managed by the current organization owner/i)).toBeInTheDocument();
  });

  it('shows a sign-in handoff that returns to the claim flow', async () => {
    currentUser = null;
    getPresentationMock.mockResolvedValue({
      ...unclaimedPresentation,
      signInRequired: true,
    });
    renderWithMantine(<OrganizationClaimWizard />);

    const link = await screen.findByRole('link', { name: 'Sign in or create an account' });
    expect(link).toHaveAttribute(
      'href',
      '/login?next=%2Forganizations%2Forg-1%2Fclaim',
    );
  });

  it('loads and explains an existing manual-review claim', async () => {
    getPresentationMock.mockResolvedValue({
      ...unclaimedPresentation,
      ownershipStatus: 'CLAIM_PENDING',
      claimable: false,
      ownershipAction: 'VIEW_PENDING_CLAIM',
      viewerClaimId: 'claim-2',
    });
    getClaimMock.mockResolvedValue({
      ...pendingEmailClaim,
      id: 'claim-2',
      requestType: 'OWNERSHIP_TRANSFER',
      method: 'MANUAL_REVIEW',
      status: 'PENDING_MANUAL_REVIEW',
      roleTitle: 'Executive director',
      explanation: 'I am the authorized representative.',
    });
    renderWithMantine(<OrganizationClaimWizard />);

    expect(await screen.findByRole('heading', { name: 'Request submitted for review' })).toBeInTheDocument();
    expect(screen.getByText(/current owner's access and the public claimed status stay unchanged/i)).toBeInTheDocument();
  });
});
