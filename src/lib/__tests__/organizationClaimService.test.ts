const apiRequestMock = jest.fn();

jest.mock('@/lib/apiClient', () => ({
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
}));

import { organizationClaimService } from '@/lib/organizationClaimService';

describe('organizationClaimService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('loads the public claim presentation', async () => {
    const claim = { organizationId: 'org/1', organizationName: 'River City' };
    apiRequestMock.mockResolvedValue({ claim });

    await expect(organizationClaimService.getPresentation('org/1')).resolves.toBe(claim);
    expect(apiRequestMock).toHaveBeenCalledWith('/api/organizations/org%2F1/claim');
  });

  it('creates a claim through the organization-scoped route', async () => {
    const claim = { id: 'claim-1' };
    apiRequestMock.mockResolvedValue({ claim });

    await expect(organizationClaimService.createClaim('org-1', {
      requestType: 'INITIAL_CLAIM',
      method: 'DOMAIN_EMAIL',
      verificationEmail: 'owner@rivercitysports.org',
    })).resolves.toBe(claim);
    expect(apiRequestMock).toHaveBeenCalledWith('/api/organizations/org-1/claims', {
      method: 'POST',
      body: {
        requestType: 'INITIAL_CLAIM',
        method: 'DOMAIN_EMAIL',
        verificationEmail: 'owner@rivercitysports.org',
      },
    });
  });

  it('starts and confirms MFA before ownership acceptance', async () => {
    apiRequestMock
      .mockResolvedValueOnce({ mfa: { challengeId: 'mfa-1' } })
      .mockResolvedValueOnce({ claim: { id: 'claim-1', status: 'APPROVED' } });

    await expect(organizationClaimService.startMfa('org-1', 'claim-1')).resolves.toEqual({
      challengeId: 'mfa-1',
    });
    await expect(organizationClaimService.confirmMfa('org-1', 'claim-1', {
      challengeId: 'mfa-1',
      code: '123456',
    })).resolves.toEqual({ id: 'claim-1', status: 'APPROVED' });
  });
});
