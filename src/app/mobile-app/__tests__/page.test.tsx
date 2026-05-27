import { render, screen } from '@testing-library/react';
import MobileAppPage, { metadata } from '../page';
import { ANDROID_STORE_URL_DEFAULT, IOS_STORE_URL_DEFAULT } from '@/lib/mobileAppLinks';

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({
    priority: _priority,
    ...props
  }: React.ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean }) => <img {...props} alt={props.alt ?? ''} />,
}));

jest.mock('@/components/marketing/MarketingHeader', () => ({
  __esModule: true,
  default: () => <header data-testid="marketing-header" />,
}));

describe('MobileAppPage', () => {
  it('renders store links and the mobile discover screenshot', () => {
    render(<MobileAppPage />);

    expect(screen.getByTestId('marketing-header')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /get the bracketiq mobile app/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /download bracketiq on the app store/i })).toHaveAttribute(
      'href',
      IOS_STORE_URL_DEFAULT,
    );
    expect(screen.getByRole('link', { name: /get bracketiq on google play/i })).toHaveAttribute(
      'href',
      ANDROID_STORE_URL_DEFAULT,
    );
    expect(screen.getByAltText('BracketIQ mobile app discover page screenshot')).toHaveAttribute(
      'src',
      '/landing/discover_screen_mobile.png',
    );
  });

  it('sets canonical mobile app metadata', () => {
    expect(metadata.title).toBe('Get the BracketIQ Mobile App | BracketIQ');
    expect(metadata.alternates?.canonical).toBe('/mobile-app');
    expect(metadata.openGraph?.url).toBe('https://bracket-iq.com/mobile-app');
  });
});
