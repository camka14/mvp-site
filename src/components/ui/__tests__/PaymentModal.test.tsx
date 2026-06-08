import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';

import PaymentModal from '../PaymentModal';
import type { PaymentIntent } from '@/types';

jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img {...props} alt={props.alt ?? ''} />
  ),
}));

jest.mock('@stripe/stripe-js', () => ({
  loadStripe: jest.fn(() => Promise.resolve({})),
}));

jest.mock('@stripe/react-stripe-js', () => ({
  Elements: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@/lib/billingAddressService', () => ({
  billingAddressService: {
    getBillingAddressProfile: jest.fn(() => Promise.resolve({
      billingAddress: null,
      email: 'payer@example.com',
    })),
  },
}));

jest.mock('../PaymentForm', () => ({
  __esModule: true,
  default: () => <div data-testid="payment-form" />,
}));

const paymentData: PaymentIntent = {
  publishableKey: 'pk_test_mock',
  paymentIntent: 'pi_mock_secret_mock',
  feeBreakdown: {
    eventPrice: 1500,
    processingFee: 100,
    stripeFee: 0,
    taxAmount: 0,
    totalCharge: 1600,
    hostReceives: 1500,
    feePercentage: 0,
    purchaseType: 'event',
  },
};

describe('PaymentModal', () => {
  it('can open after an initial closed render without changing hook order', async () => {
    const { rerender } = render(
      <PaymentModal
        isOpen={false}
        onClose={() => {}}
        event={{
          name: 'Paid Event',
          location: 'New York, NY',
          eventType: 'EVENT',
          price: 1500,
        }}
        paymentData={null}
        onPaymentSuccess={() => {}}
      />,
      {
        wrapper: ({ children }) => (
          <MantineProvider>{children}</MantineProvider>
        ),
      },
    );

    expect(screen.queryByText('Confirm Payment')).not.toBeInTheDocument();

    rerender(
      <PaymentModal
        isOpen
        onClose={() => {}}
        event={{
          name: 'Paid Event',
          location: 'New York, NY',
          eventType: 'EVENT',
          price: 1500,
        }}
        paymentData={paymentData}
        onPaymentSuccess={() => {}}
      />,
    );

    expect(await screen.findByText('Confirm Payment')).toBeInTheDocument();
    expect(screen.getByText('Paid Event')).toBeInTheDocument();
  });
});
