import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithMantine } from '../../../../../../../test/utils/renderWithMantine';
import { apiRequest } from '@/lib/apiClient';
import EventFinancePanel from '../EventFinancePanel';

jest.mock('@/lib/apiClient', () => ({
  apiRequest: jest.fn(),
  isApiRequestError: jest.fn(() => false),
}));

const financeResponse = {
  finance: {
    eventId: 'event_1',
    actualRevenueCents: 20000,
    actualCostCents: 7500,
    actualProfitCents: 12500,
    futureCostCents: 3000,
    potentialRevenueCents: 5000,
    projectedProfitCents: 14500,
    warnings: [],
    lineItems: [
      {
        id: 'bill:bill_1:paid',
        sourceType: 'bill',
        sourceId: 'bill_1',
        scope: 'EVENT',
        label: 'Registration payment',
        category: 'registration',
        amountCents: 20000,
        classification: 'revenue',
        status: 'PAID',
        timing: 'ACTUAL',
        serviceStartAt: '2026-06-01T00:00:00.000Z',
        isGenerated: true,
      },
      {
        id: 'labor:labor_1',
        sourceType: 'labor',
        sourceId: 'labor_1',
        scope: 'EVENT',
        label: 'Alex Staff',
        category: 'labor',
        amountCents: -7500,
        classification: 'labor_cost',
        status: 'ACTUAL',
        timing: 'ACTUAL',
        serviceStartAt: '2026-06-01T00:00:00.000Z',
        serviceEndAt: '2026-06-01T02:00:00.000Z',
        isGenerated: true,
      },
      {
        id: 'custom:future_1',
        sourceType: 'custom_line_item',
        sourceId: 'future_1',
        scope: 'EVENT',
        label: 'Future supplies',
        category: 'Supplies',
        amountCents: -3000,
        classification: 'custom_cost',
        status: 'ACTUAL',
        timing: 'FUTURE',
        serviceStartAt: '2026-07-01T00:00:00.000Z',
        isGenerated: false,
      },
      {
        id: 'potential:event:event_1:open-spots',
        sourceType: 'event',
        sourceId: 'event_1',
        scope: 'EVENT',
        label: 'Potential open-spot revenue',
        category: 'potential',
        amountCents: 5000,
        classification: 'potential_revenue',
        status: 'PROJECTED',
        timing: 'POTENTIAL',
        serviceStartAt: '2026-06-15T00:00:00.000Z',
        isGenerated: true,
      },
    ],
  },
};

describe('EventFinancePanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders event finance summary and line items', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce(financeResponse);

    renderWithMantine(
      <EventFinancePanel
        eventId="event_1"
        organizationId="org_1"
        isActive
        canManage
      />,
    );

    expect(await screen.findByText('Profit analysis')).toBeInTheDocument();
    expect(screen.getAllByText('$200.00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('-$75.00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('$125.00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('-$30.00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('future').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Potential open-spot revenue').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Generated').length).toBeGreaterThan(0);
    expect(apiRequest).toHaveBeenCalledWith('/api/events/event_1/finance');
  });

  it('submits a custom event cost and refreshes finance', async () => {
    (apiRequest as jest.Mock)
      .mockResolvedValueOnce(financeResponse)
      .mockResolvedValueOnce({ lineItem: { id: 'line_1' } })
      .mockResolvedValueOnce({
        finance: {
          ...financeResponse.finance,
          actualCostCents: 10500,
          actualProfitCents: 9500,
          futureCostCents: 3000,
          projectedProfitCents: 11500,
          lineItems: [
            ...financeResponse.finance.lineItems,
            {
              id: 'custom:line_1',
              sourceType: 'custom_line_item',
              sourceId: 'line_1',
              scope: 'EVENT',
              label: 'Awards',
              category: 'Supplies',
              amountCents: -3000,
              classification: 'custom_cost',
              status: 'ACTUAL',
              timing: 'ACTUAL',
              serviceStartAt: '2026-06-02T00:00:00.000Z',
              isGenerated: false,
            },
          ],
        },
      });

    renderWithMantine(
      <EventFinancePanel
        eventId="event_1"
        organizationId="org_1"
        isActive
        canManage
      />,
    );

    await screen.findByText('Add custom event cost');

    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'Awards' },
    });
    fireEvent.change(screen.getByLabelText('Category'), {
      target: { value: 'Supplies' },
    });
    fireEvent.change(screen.getByLabelText('Amount'), {
      target: { value: '30' },
    });
    fireEvent.change(screen.getByLabelText('Start date'), {
      target: { value: '2026-07-15' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add cost' }));

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith('/api/organizations/org_1/finance/line-items', {
        method: 'POST',
        body: {
          scope: 'EVENT',
          eventId: 'event_1',
          category: 'Supplies',
          title: 'Awards',
          amountCents: 3000,
          status: 'ACTUAL',
          serviceStartAt: expect.stringContaining('2026-07-15'),
          serviceEndAt: null,
        },
      });
    });
    expect((await screen.findAllByText('Awards')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Custom').length).toBeGreaterThan(0);
  });
});
