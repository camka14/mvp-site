import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import RequestDemoForm from '../RequestDemoForm';

const fetchMock = jest.fn();
const originalFetch = global.fetch;

const fillRequiredFields = () => {
  fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Morgan Host' } });
  fireEvent.change(screen.getByLabelText(/work email/i), { target: { value: 'morgan@example.com' } });
  fireEvent.change(screen.getByLabelText(/organization/i), { target: { value: 'Morgan Volleyball Club' } });
};

describe('RequestDemoForm', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('submits a demo request and shows the success state', async () => {
    render(<RequestDemoForm />);

    fillRequiredFields();
    fireEvent.change(screen.getByLabelText(/event type/i), { target: { value: 'Leagues' } });
    fireEvent.change(screen.getByLabelText(/what do you want to run/i), {
      target: { value: 'Scheduling and registration for weekly leagues.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send demo request/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const [, requestInit] = fetchMock.mock.calls[0];
    expect(fetchMock).toHaveBeenCalledWith('/api/demo-requests', expect.objectContaining({
      method: 'POST',
    }));
    expect(JSON.parse(requestInit.body)).toEqual(expect.objectContaining({
      name: 'Morgan Host',
      email: 'morgan@example.com',
      organization: 'Morgan Volleyball Club',
      eventType: 'Leagues',
      message: 'Scheduling and registration for weekly leagues.',
      sourcePath: expect.stringContaining('/'),
    }));
    expect(await screen.findByRole('status')).toHaveTextContent(/demo request sent/i);
  });

  it('shows the server error when submission fails', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Demo request notifications are unavailable.' }),
    });

    render(<RequestDemoForm />);

    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: /send demo request/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Demo request notifications are unavailable.');
  });
});
