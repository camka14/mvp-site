import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import AdminFeedbackPanel, { type AdminFeedbackItem } from '../AdminFeedbackPanel';
import { apiRequest } from '@/lib/apiClient';

jest.mock('@/lib/apiClient', () => ({
  apiRequest: jest.fn(),
}));

const apiRequestMock = apiRequest as jest.MockedFunction<typeof apiRequest>;

const item: AdminFeedbackItem = {
  id: 'feedback_1',
  createdAt: '2026-08-06T20:00:00.000Z',
  updatedAt: '2026-08-06T20:00:00.000Z',
  type: 'BUG',
  status: 'NEW',
  message: 'The schedule button does not save the selected field.',
  additionalContext: 'Expected the selected court to remain visible.',
  submitterUserId: 'user_1',
  allowContact: false,
  contactEmail: 'hidden@example.com',
  sourcePath: '/discover',
  userAgent: 'browser',
  clientContext: { surface: 'WEB', viewportWidth: 390 },
  reviewedAt: null,
  reviewedByUserId: null,
  reviewNotes: null,
};

const listResponse = { items: [item], total: 1, page: 1, pageSize: 25, totalPages: 1 };

const renderPanel = () => render(
  <MantineProvider>
    <AdminFeedbackPanel active openCount={1} />
  </MantineProvider>,
);

describe('AdminFeedbackPanel', () => {
  beforeEach(() => {
    apiRequestMock.mockResolvedValue(listResponse as never);
  });

  it('loads rows and hides a contact email when consent is false', async () => {
    renderPanel();

    expect(await screen.findByText(/schedule button does not save/i)).toBeInTheDocument();
    expect(screen.getByText('Not permitted')).toBeInTheDocument();
    expect(screen.queryByText('hidden@example.com')).not.toBeInTheDocument();
  });

  it('opens details, applies filters, and saves a status and note', async () => {
    const user = userEvent.setup();
    apiRequestMock.mockResolvedValue(listResponse as never);
    renderPanel();

    await user.click(await screen.findByText(/schedule button does not save/i));
    expect(await screen.findByText(/expected the selected court/i)).toBeInTheDocument();
    expect(screen.getAllByText(/not permitted/i).length).toBeGreaterThanOrEqual(1);

    await user.type(screen.getByLabelText('Search'), 'court');
    await user.click(screen.getByRole('button', { name: /apply filters/i }));
    await waitFor(() => expect(apiRequestMock).toHaveBeenLastCalledWith(
      '/api/admin/feedback?page=1&pageSize=25&query=court',
    ));

    await user.click(screen.getAllByLabelText(/status/i)[1]);
    await user.click(screen.getAllByText('In review')[1]);
    await user.type(screen.getByLabelText(/review notes/i), 'Reviewed.');
    apiRequestMock.mockResolvedValueOnce({ item: { ...item, status: 'IN_REVIEW', reviewNotes: 'Reviewed.' } } as never);
    await user.click(screen.getByRole('button', { name: /save review/i }));

    await waitFor(() => expect(apiRequestMock).toHaveBeenLastCalledWith(
      '/api/admin/feedback/feedback_1',
      expect.objectContaining({ method: 'PATCH', body: { status: 'IN_REVIEW', reviewNotes: 'Reviewed.' } }),
    ));
  });

  it('shows a clear empty and error state', async () => {
    apiRequestMock.mockReset();
    apiRequestMock.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 25, totalPages: 0 } as never);
    const view = renderPanel();
    expect(await screen.findByText(/no feedback matches/i)).toBeInTheDocument();

    view.unmount();
    apiRequestMock.mockReset();
    apiRequestMock.mockRejectedValue(new Error('Unable to load feedback.'));
    renderPanel();
    expect(await screen.findByText(/unable to load feedback/i)).toBeInTheDocument();
  });
});
