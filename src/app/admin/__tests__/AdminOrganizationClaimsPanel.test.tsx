import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';

import AdminOrganizationClaimsPanel from '../AdminOrganizationClaimsPanel';

const claimRow = {
  id: 'claim_1',
  organizationId: 'org_1',
  claimantUserId: 'claimant_1',
  requestType: 'INITIAL_CLAIM',
  status: 'PENDING_MANUAL_REVIEW',
  method: 'MANUAL_REVIEW',
  verificationLevel: 'NONE',
  roleTitle: 'Director',
  issueReason: null,
  requestedOutcome: null,
  submittedAt: '2026-07-29T20:00:00.000Z',
  createdAt: '2026-07-29T19:00:00.000Z',
  updatedAt: '2026-07-29T20:00:00.000Z',
  organization: {
    id: 'org_1',
    name: 'River City Sports Club',
    ownershipStatus: 'CLAIM_PENDING',
  },
  claimant: {
    id: 'claimant_1',
    name: 'Morgan Reed',
    email: 'morgan@rivercitysports.org',
    emailVerifiedAt: '2026-07-01T00:00:00.000Z',
  },
};

const listPayload = {
  claims: [claimRow],
  pagination: {
    page: 1,
    pageSize: 25,
    total: 1,
    pageCount: 1,
  },
};

const detailPayload = {
  claim: {
    ...claimRow,
    explanation: 'I manage the club and can update its official website.',
    verificationEmail: 'morgan@rivercitysports.org',
    internalDecisionNotes: null,
  },
  organization: {
    id: 'org_1',
    name: 'River City Sports Club',
    ownerId: 'owner_1',
    website: 'https://rivercitysports.org',
    originType: 'AFFILIATE_IMPORTED',
    ownershipStatus: 'CLAIM_PENDING',
    claimVerificationLevel: 'NONE',
  },
  domains: [{
    id: 'domain_1',
    host: 'rivercitysports.org',
    registrableDomain: 'rivercitysports.org',
    isPrimary: true,
    isSharedPlatform: false,
    verifiedAt: null,
  }],
  evidence: [],
  events: [{
    id: 'event_1',
    eventType: 'ORGANIZATION_CLAIM_CREATED',
    actorUserId: 'claimant_1',
    createdAt: '2026-07-29T19:00:00.000Z',
  }],
  claimant: claimRow.claimant,
  currentOwner: {
    id: 'owner_1',
    name: 'Current Owner',
    email: 'owner@rivercitysports.org',
    emailVerifiedAt: '2026-06-01T00:00:00.000Z',
  },
  staff: [],
  reviewedBy: 'samuel.r@razumly.com',
};

const jsonResponse = (payload: unknown, ok = true): Response => ({
  ok,
  json: async () => payload,
} as Response);

describe('AdminOrganizationClaimsPanel', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    if (originalFetch) {
      globalThis.fetch = originalFetch;
    } else {
      Reflect.deleteProperty(globalThis, 'fetch');
    }
    jest.restoreAllMocks();
  });

  it('loads review context and requires a claimant-facing message before approving', async () => {
    const fetchMock = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith('/api/admin/organization-claims?')) {
        return Promise.resolve(jsonResponse(listPayload));
      }
      if (url === '/api/admin/organization-claims/claim_1' && init?.method === 'PATCH') {
        return Promise.resolve(jsonResponse({
          claim: { ...claimRow, status: 'APPROVED_PENDING_ACCEPTANCE' },
        }));
      }
      if (url === '/api/admin/organization-claims/claim_1') {
        return Promise.resolve(jsonResponse(detailPayload));
      }
      return Promise.resolve(jsonResponse({ error: `Unexpected fetch ${url}` }, false));
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const onTotalChange = jest.fn();
    const user = userEvent.setup();

    render(
      <MantineProvider>
        <AdminOrganizationClaimsPanel
          active
          refreshKey={0}
          onTotalChange={onTotalChange}
        />
      </MantineProvider>,
    );

    expect(await screen.findByRole('heading', { name: 'River City Sports Club' })).toBeInTheDocument();
    expect(screen.getByText('owner@rivercitysports.org')).toBeInTheDocument();
    expect(screen.getByText('I manage the club and can update its official website.')).toBeInTheDocument();
    expect(onTotalChange).toHaveBeenCalledWith(1);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save decision' })).toBeEnabled();
    });
    await user.click(screen.getByRole('button', { name: 'Save decision' }));
    expect(await screen.findByText('Enter the claimant-facing decision message before saving.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/admin/organization-claims/claim_1',
      expect.objectContaining({ method: 'PATCH' }),
    );

    await user.type(
      screen.getByRole('textbox', { name: /message to claimant/i }),
      'Your public evidence confirms your role. Complete MFA to accept ownership.',
    );
    await user.click(screen.getByRole('button', { name: 'Save decision' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/organization-claims/claim_1',
        expect.objectContaining({ method: 'PATCH' }),
      );
    });
    const patchCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(JSON.parse(String(patchCall?.[1]?.body))).toEqual(expect.objectContaining({
      action: 'APPROVE',
      verificationLevel: 'MANUAL_REVIEW',
      userDecisionMessage: 'Your public evidence confirms your role. Complete MFA to accept ownership.',
    }));
    expect(await screen.findByText('Decision saved and added to the claim audit trail.')).toBeInTheDocument();
  });
});
