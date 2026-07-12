import { apiRequest } from '@/lib/apiClient';
import { refundRequestService } from '@/lib/refundRequestService';

jest.mock('@/lib/apiClient', () => ({
  apiRequest: jest.fn(),
}));

const apiRequestMock = apiRequest as jest.MockedFunction<typeof apiRequest>;

describe('refundRequestService', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
  });

  it('sends the reviewed scope version and hash when approving a refund', async () => {
    apiRequestMock.mockResolvedValue({
      $id: 'refund_1',
      eventId: 'event_1',
      userId: 'user_1',
      reason: 'Need to cancel',
      status: 'APPROVED',
    });

    await refundRequestService.updateRefundStatus('refund_1', 'APPROVED', {
      scopeVersion: 2,
      scopeHash: 'scope_hash_1',
    });

    expect(apiRequestMock).toHaveBeenCalledWith('/api/refund-requests/refund_1', {
      method: 'PATCH',
      body: {
        status: 'APPROVED',
        expectedScopeVersion: 2,
        expectedScopeHash: 'scope_hash_1',
      },
    });
  });

  it('does not send an approval without a current immutable scope', async () => {
    await expect(refundRequestService.updateRefundStatus('refund_1', 'APPROVED')).rejects.toThrow(
      'needs a current approval preview',
    );

    expect(apiRequestMock).not.toHaveBeenCalled();
  });
});
