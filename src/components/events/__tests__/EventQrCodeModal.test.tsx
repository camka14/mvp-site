import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import { EventQrCodeModal, buildEventPublicUrl } from '@/components/events/EventQrCodeModal';

const renderModal = () => render(
  <MantineProvider>
    <EventQrCodeModal
      eventId="event_1"
      eventName="Spring Tournament"
      eventUrl="http://localhost/events/event_1"
      opened
      onClose={jest.fn()}
    />
  </MantineProvider>,
);

describe('EventQrCodeModal', () => {
  it('renders the generated event QR image and public link', () => {
    renderModal();

    expect(screen.getByRole('img', { name: /qr code for spring tournament/i }))
      .toHaveAttribute('src', '/api/events/event_1/qr');
    expect(screen.getByText('http://localhost/events/event_1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy link/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /download png/i })).toBeInTheDocument();
  });

  it('builds event URLs from the current browser origin', () => {
    expect(buildEventPublicUrl('event 1')).toBe('http://localhost/events/event%201');
  });
});

