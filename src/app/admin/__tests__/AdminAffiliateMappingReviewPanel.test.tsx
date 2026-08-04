import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import AdminAffiliateMappingReviewPanel from '../AdminAffiliateMappingReviewPanel';

const response = (payload: unknown, ok = true): Response => ({
  ok,
  json: async () => payload,
} as Response);

describe('AdminAffiliateMappingReviewPanel', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    if (originalFetch) globalThis.fetch = originalFetch;
    else Reflect.deleteProperty(globalThis, 'fetch');
    jest.restoreAllMocks();
  });

  it('shows the decision question and opens the existing intake evidence flow', async () => {
    const onReviewIntake = jest.fn();
    globalThis.fetch = jest.fn().mockResolvedValue(response({
      jobs: [{
        jobId: 'mapping_1',
        intakeId: 'intake_1',
        intakeName: 'New York Elite Volleyball',
        sourceKey: 'new-york-elite-volleyball',
        region: 'New York, NY',
        baseUrl: 'https://example.test',
        intakeStatus: 'REVIEW_REQUIRED',
        complianceStatus: 'ALLOWED',
        attemptCount: 3,
        markedAt: '2026-08-02T12:00:00.000Z',
        reasonCodes: ['CONFLICTING_LIVE_RECORD'],
        rationale: 'A live organization has the same identity.',
        blockingIssues: ['Confirm whether both records represent the same organization.'],
        hasSelectedLogo: false,
        reviewOwner: 'USER',
        reviewQuestion: 'Is this source the same as the conflicting live record, or should both records remain separate?',
        recommendedAction: 'Compare the source identity with the live record.',
      }],
    })) as typeof fetch;

    render(
      <MantineProvider>
        <AdminAffiliateMappingReviewPanel active refreshKey={0} onReviewIntake={onReviewIntake} />
      </MantineProvider>,
    );

    expect(await screen.findByText('New York Elite Volleyball')).toBeInTheDocument();
    expect(screen.getByText('Conflicting live record')).toBeInTheDocument();
    expect(screen.getByText(/Is this source the same as the conflicting live record/)).toBeInTheDocument();
    expect(screen.getAllByText(/Your decision/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'View evidence' }));
    expect(onReviewIntake).toHaveBeenCalledWith('intake_1');
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith('/api/admin/affiliate-mapping-reviews', {
        credentials: 'include',
      });
    });
  });
});
