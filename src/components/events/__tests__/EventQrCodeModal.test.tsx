import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  EventQrCodeModal,
  buildEventPublicUrl,
} from '@/components/events/EventQrCodeModal';

const originalFetch = globalThis.fetch;

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
  afterEach(() => {
    jest.restoreAllMocks();
    if (originalFetch) {
      Object.defineProperty(globalThis, 'fetch', {
        configurable: true,
        writable: true,
        value: originalFetch,
      });
    } else {
      Reflect.deleteProperty(globalThis, 'fetch');
    }
    Reflect.deleteProperty(navigator, 'share');
    Reflect.deleteProperty(navigator, 'canShare');
  });

  it('renders the generated event QR image and default actions without customization', () => {
    renderModal();

    expect(screen.getByRole('img', { name: /qr code for spring tournament/i }))
      .toHaveAttribute('src', '/api/events/event_1/qr?brand=event&logo=biq');
    expect(screen.getByText('http://localhost/events/event_1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy link/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /download png/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^share$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /customize/i })).not.toBeInTheDocument();
  });

  it('builds event URLs from the current browser origin', () => {
    expect(buildEventPublicUrl('event 1')).toBe('http://localhost/events/event%201');
  });

  it('shares the generated QR image file', async () => {
    const pngBlob = new Blob(['png'], { type: 'image/png' });
    const fetchMock = jest.fn(async () => ({
      ok: true,
      blob: async () => pngBlob,
    }));
    const shareMock = jest.fn(async () => undefined);
    const canShareMock = jest.fn(() => true);
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      writable: true,
      value: fetchMock,
    });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: shareMock,
    });
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      value: canShareMock,
    });

    renderModal();
    fireEvent.click(screen.getByRole('button', { name: /^share$/i }));

    await waitFor(() => expect(shareMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith('/api/events/event_1/qr?brand=event&logo=biq', {
      credentials: 'include',
    });
    expect(canShareMock).toHaveBeenCalledWith(expect.objectContaining({
      files: [expect.any(File)],
      title: 'Spring Tournament QR code',
    }));
    expect(shareMock).toHaveBeenCalledWith(expect.objectContaining({
      files: [expect.any(File)],
      title: 'Spring Tournament QR code',
    }));
  });
});
