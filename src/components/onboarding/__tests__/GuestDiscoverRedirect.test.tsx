import { render, screen, waitFor } from '@testing-library/react';
import GuestDiscoverRedirect from '../GuestDiscoverRedirect';

const replaceMock = jest.fn();
const startGuestSessionMock = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

jest.mock('@/app/providers', () => ({
  useApp: () => ({ startGuestSession: startGuestSessionMock }),
}));

jest.mock('@/components/ui/Loading', () => ({
  __esModule: true,
  default: ({ text }: { text: string }) => <div>{text}</div>,
}));

describe('GuestDiscoverRedirect', () => {
  beforeEach(() => {
    replaceMock.mockReset();
    startGuestSessionMock.mockReset().mockResolvedValue(undefined);
  });

  it('restores guest access before opening Discover', async () => {
    render(<GuestDiscoverRedirect />);

    expect(screen.getByText('Opening Discover...')).toBeInTheDocument();
    await waitFor(() => expect(startGuestSessionMock).toHaveBeenCalledTimes(1));
    expect(replaceMock).toHaveBeenCalledWith('/discover');
    expect(startGuestSessionMock.mock.invocationCallOrder[0]).toBeLessThan(
      replaceMock.mock.invocationCallOrder[0],
    );
  });
});
