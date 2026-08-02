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

  it('shows structured terminal reasons and opens the existing intake evidence flow', async () => {
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
        reasonCodes: ['NO_VERIFIABLE_OFFICIAL_LOGO'],
        rationale: 'No reusable mark was found.',
        blockingIssues: ['Logo evidence is exhausted.'],
        hasSelectedLogo: false,
      }],
    })) as typeof fetch;

    render(
      <MantineProvider>
        <AdminAffiliateMappingReviewPanel active refreshKey={0} onReviewIntake={onReviewIntake} />
      </MantineProvider>,
    );

    expect(await screen.findByText('New York Elite Volleyball')).toBeInTheDocument();
    expect(screen.getByText('No verifiable official logo')).toBeInTheDocument();
    expect(screen.getByText(/Logo evidence is exhausted\./)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Evidence' }));
    expect(onReviewIntake).toHaveBeenCalledWith('intake_1');
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith('/api/admin/affiliate-mapping-reviews', {
        credentials: 'include',
      });
    });
  });
});
