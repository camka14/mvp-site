'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Button,
  Container,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useApp } from '@/app/providers';
import BillingAddressModal from '@/components/ui/BillingAddressModal';
import PaymentModal from '@/components/ui/PaymentModal';
import { isApiRequestError } from '@/lib/apiClient';
import { paymentService } from '@/lib/paymentService';
import { navigateToPublicCompletion } from '@/lib/publicCompletionRedirect';
import { productService } from '@/lib/productService';
import type { PublicOrganizationSummary } from '@/server/publicOrganizationCatalog';
import type { BillingAddress, PaymentIntent, Product } from '@/types';
import { formatPrice } from '@/types';

const isSinglePurchasePeriod = (period: Product['period'] | string | null | undefined): boolean =>
  String(period ?? '').trim().toLowerCase() === 'single';

const formatProductPriceLabel = (product: Product): string => (
  isSinglePurchasePeriod(product.period)
    ? formatPrice(product.priceCents)
    : `${formatPrice(product.priceCents)} / ${product.period}`
);

type PublicProductCheckoutClientProps = {
  slug: string;
  organization: PublicOrganizationSummary;
  product: Product;
};

export default function PublicProductCheckoutClient({
  slug,
  organization,
  product,
}: PublicProductCheckoutClientProps) {
  const router = useRouter();
  const { user, loading: authLoading } = useApp();
  const checkoutStartedRef = useRef(false);
  const [paymentData, setPaymentData] = useState<PaymentIntent | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showBillingAddressModal, setShowBillingAddressModal] = useState(false);
  const [startingCheckout, setStartingCheckout] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const startProductCheckout = useCallback(async (billingAddress?: BillingAddress) => {
    if (!user) {
      return;
    }
    setStartingCheckout(true);
    setCheckoutError(null);
    try {
      const intent = isSinglePurchasePeriod(product.period)
        ? await paymentService.createProductPaymentIntent(
            user,
            product,
            { $id: organization.id, name: organization.name },
            billingAddress,
          )
        : await productService.createSubscriptionCheckout({
            productId: product.$id,
            billingAddress,
          });
      setPaymentData(intent);
      setShowBillingAddressModal(false);
      setShowPaymentModal(true);
    } catch (error) {
      if (
        isApiRequestError(error)
        && error.data
        && typeof error.data === 'object'
        && 'billingAddressRequired' in error.data
        && Boolean((error.data as { billingAddressRequired?: boolean }).billingAddressRequired)
      ) {
        setShowBillingAddressModal(true);
        return;
      }
      console.error('Failed to start public product checkout', error);
      setCheckoutError(error instanceof Error ? error.message : 'Unable to start checkout.');
      checkoutStartedRef.current = false;
    } finally {
      setStartingCheckout(false);
    }
  }, [organization.id, organization.name, product, user]);

  useEffect(() => {
    if (authLoading || !user || checkoutStartedRef.current) {
      return;
    }
    checkoutStartedRef.current = true;
    void startProductCheckout();
  }, [authLoading, startProductCheckout, user]);

  const handlePaymentSuccess = useCallback(() => {
    notifications.show({
      color: 'green',
      message: isSinglePurchasePeriod(product.period)
        ? `Purchase completed for ${product.name}.`
        : `Subscription started for ${product.name}.`,
    });
    setShowPaymentModal(false);
    setPaymentData(null);
    navigateToPublicCompletion({
      router,
      slug,
      kind: 'product',
      redirectUrl: organization.publicCompletionRedirectUrl,
    });
  }, [organization.publicCompletionRedirectUrl, product.name, product.period, router, slug]);

  return (
    <Container size="sm" py="xl">
      <Paper withBorder radius="md" p="xl">
        <Stack gap="lg">
          <div>
            <Text size="sm" c="dimmed">{organization.name}</Text>
            <Title order={1}>{product.name}</Title>
            {product.description ? <Text c="dimmed">{product.description}</Text> : null}
          </div>

          <Group justify="space-between">
            <Text fw={600}>Total</Text>
            <Text fw={700}>{formatProductPriceLabel(product)}</Text>
          </Group>

          {authLoading ? (
            <Group gap="sm">
              <Loader size="sm" />
              <Text size="sm" c="dimmed">Checking your session.</Text>
            </Group>
          ) : null}

          {!authLoading && !user ? (
            <Alert color="yellow" title="Sign in required">
              <Stack gap="sm">
                <Text size="sm">Sign in before purchasing this product.</Text>
                <Button onClick={() => router.push('/login')}>Sign in to purchase</Button>
              </Stack>
            </Alert>
          ) : null}

          {checkoutError ? (
            <Alert color="red" title="Checkout unavailable">
              <Stack gap="sm">
                <Text size="sm">{checkoutError}</Text>
                <Button
                  variant="light"
                  loading={startingCheckout}
                  onClick={() => {
                    checkoutStartedRef.current = true;
                    void startProductCheckout();
                  }}
                >
                  Try again
                </Button>
              </Stack>
            </Alert>
          ) : null}

          {!authLoading && user && !showPaymentModal && !checkoutError ? (
            <Button loading={startingCheckout} onClick={() => void startProductCheckout()}>
              Open payment
            </Button>
          ) : null}
        </Stack>
      </Paper>

      <BillingAddressModal
        opened={showBillingAddressModal}
        onClose={() => setShowBillingAddressModal(false)}
        onSaved={async (billingAddress) => {
          checkoutStartedRef.current = true;
          await startProductCheckout(billingAddress);
        }}
        title="Billing address required"
        description="Enter your billing address so tax can be calculated before checkout."
      />

      <PaymentModal
        isOpen={showPaymentModal && Boolean(paymentData)}
        onClose={() => {
          setShowPaymentModal(false);
          setPaymentData(null);
        }}
        event={{
          name: product.name,
          location: organization.name,
          eventType: 'EVENT',
          price: product.priceCents,
        }}
        paymentData={paymentData}
        onPaymentSuccess={handlePaymentSuccess}
      />
    </Container>
  );
}
