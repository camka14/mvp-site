'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Button,
  Group,
  Modal,
  PasswordInput,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useApp } from '@/app/providers';
import BillingAddressModal from '@/components/ui/BillingAddressModal';
import PaymentModal from '@/components/ui/PaymentModal';
import { isApiRequestError } from '@/lib/apiClient';
import { ApiError, authService } from '@/lib/auth';
import { paymentService } from '@/lib/paymentService';
import { navigateToPublicCompletion } from '@/lib/publicCompletionRedirect';
import { productService } from '@/lib/productService';
import type {
  PublicOrganizationProductCard,
  PublicOrganizationSummary,
} from '@/server/publicOrganizationCatalog';
import type { BillingAddress, PaymentIntent, Product, ProductPeriod, UserData } from '@/types';
import { formatPrice } from '@/types';
import styles from './PublicOrganizationPage.module.css';

type PublicProductGridProps = {
  slug: string;
  organization: PublicOrganizationSummary;
  products: PublicOrganizationProductCard[];
};

type AuthModalMode = 'login' | 'signup';

type AuthModalForm = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  userName: string;
  dateOfBirth: string;
};

const PENDING_PRODUCT_CHECKOUT_KEY = 'public-product-checkout';

const EMPTY_AUTH_MODAL_FORM: AuthModalForm = {
  email: '',
  password: '',
  firstName: '',
  lastName: '',
  userName: '',
  dateOfBirth: '',
};

const isSinglePurchasePeriod = (period: string | null | undefined): boolean =>
  String(period ?? '').trim().toLowerCase() === 'single';

const normalizeProductPeriod = (value: unknown): ProductPeriod => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (normalized === 'single' || normalized === 'single_purchase' || normalized === 'one-time' || normalized === 'one_time') {
    return 'single';
  }
  if (normalized === 'weekly') return 'week';
  if (normalized === 'monthly') return 'month';
  if (normalized === 'yearly') return 'year';
  if (normalized === 'week' || normalized === 'month' || normalized === 'year') {
    return normalized as ProductPeriod;
  }
  return 'month';
};

const buildCheckoutProduct = (
  product: PublicOrganizationProductCard,
  organizationId: string,
): Product => ({
  $id: product.id,
  organizationId,
  name: product.name,
  description: product.description ?? undefined,
  priceCents: product.priceCents,
  period: normalizeProductPeriod(product.period),
  taxCategory: isSinglePurchasePeriod(product.period) ? 'ONE_TIME_PRODUCT' : 'SUBSCRIPTION',
  isActive: true,
});

const getProductPriceLabel = (product: PublicOrganizationProductCard): string => (
  isSinglePurchasePeriod(product.period)
    ? formatPrice(product.priceCents)
    : `${formatPrice(product.priceCents)} · ${String(product.period).toLowerCase()}`
);

const readPendingCheckoutProductId = (): string | null => {
  if (typeof window === 'undefined') {
    return null;
  }
  const value = window.sessionStorage.getItem(PENDING_PRODUCT_CHECKOUT_KEY);
  return value && value.trim().length > 0 ? value : null;
};

const writePendingCheckoutProductId = (productId: string): void => {
  if (typeof window === 'undefined') {
    return;
  }
  window.sessionStorage.setItem(PENDING_PRODUCT_CHECKOUT_KEY, productId);
};

const clearPendingCheckoutProductId = (): void => {
  if (typeof window === 'undefined') {
    return;
  }
  window.sessionStorage.removeItem(PENDING_PRODUCT_CHECKOUT_KEY);
};

export default function PublicProductGrid({
  slug,
  organization,
  products,
}: PublicProductGridProps) {
  const router = useRouter();
  const { user, loading: authLoading, setAuthUser, setUser } = useApp();
  const [activeProduct, setActiveProduct] = useState<PublicOrganizationProductCard | null>(null);
  const [startingProductId, setStartingProductId] = useState<string | null>(null);
  const [paymentData, setPaymentData] = useState<PaymentIntent | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showBillingAddressModal, setShowBillingAddressModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<AuthModalMode>('signup');
  const [authModalForm, setAuthModalForm] = useState<AuthModalForm>(EMPTY_AUTH_MODAL_FORM);
  const [authModalLoading, setAuthModalLoading] = useState(false);
  const [authModalError, setAuthModalError] = useState('');
  const [authVerificationEmail, setAuthVerificationEmail] = useState('');
  const [authVerificationMessage, setAuthVerificationMessage] = useState('');
  const [authVerificationMessageType, setAuthVerificationMessageType] = useState<'info' | 'success'>('info');
  const [authResendingVerification, setAuthResendingVerification] = useState(false);

  const today = useMemo(() => new Date(), []);
  const maxAuthDob = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const resetAuthModalFeedback = useCallback(() => {
    setAuthModalError('');
    setAuthVerificationEmail('');
    setAuthVerificationMessage('');
    setAuthVerificationMessageType('info');
  }, []);

  const openAuthModal = useCallback((product: PublicOrganizationProductCard) => {
    setActiveProduct(product);
    setAuthModalMode('signup');
    setAuthModalForm(EMPTY_AUTH_MODAL_FORM);
    setShowAuthModal(true);
    resetAuthModalFeedback();
  }, [resetAuthModalFeedback]);

  const closeAuthModal = useCallback(() => {
    setShowAuthModal(false);
    setAuthModalLoading(false);
    setAuthModalForm(EMPTY_AUTH_MODAL_FORM);
    resetAuthModalFeedback();
  }, [resetAuthModalFeedback]);

  const startProductCheckout = useCallback(async (
    product: PublicOrganizationProductCard,
    purchaser?: UserData | null,
    billingAddress?: BillingAddress,
  ) => {
    const resolvedUser = purchaser ?? user;
    if (!resolvedUser) {
      openAuthModal(product);
      return;
    }

    setStartingProductId(product.id);
    setActiveProduct(product);
    try {
      const intent = isSinglePurchasePeriod(product.period)
        ? await paymentService.createProductPaymentIntent(
            resolvedUser,
            buildCheckoutProduct(product, organization.id),
            { $id: organization.id, name: organization.name },
            billingAddress,
          )
        : await productService.createSubscriptionCheckout({
            productId: product.id,
            billingAddress,
          });
      clearPendingCheckoutProductId();
      setPaymentData(intent);
      setShowBillingAddressModal(false);
      setShowPaymentModal(true);
      setShowAuthModal(false);
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
      notifications.show({
        color: 'red',
        message: error instanceof Error ? error.message : 'Unable to start checkout.',
      });
    } finally {
      setStartingProductId(null);
    }
  }, [openAuthModal, organization.id, organization.name, user]);

  const handleAuthModalInputChange = useCallback((field: keyof AuthModalForm, value: string) => {
    setAuthModalForm((current) => ({ ...current, [field]: value }));
  }, []);

  const handleAuthModalResendVerification = useCallback(async () => {
    if (!authVerificationEmail) {
      return;
    }
    setAuthResendingVerification(true);
    setAuthModalError('');
    try {
      await authService.resendVerification(authVerificationEmail);
      setAuthVerificationMessage(`Verification email sent to ${authVerificationEmail}.`);
      setAuthVerificationMessageType('info');
    } catch (error) {
      setAuthModalError(error instanceof Error ? error.message : 'Failed to resend verification email.');
    } finally {
      setAuthResendingVerification(false);
    }
  }, [authVerificationEmail]);

  const handleAuthModalGoogle = useCallback(async () => {
    if (!activeProduct) {
      return;
    }
    writePendingCheckoutProductId(activeProduct.id);
    await authService.oauthLoginWithGoogle();
  }, [activeProduct]);

  const handleAuthModalSubmit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeProduct) {
      return;
    }

    setAuthModalLoading(true);
    resetAuthModalFeedback();
    try {
      const authResult = authModalMode === 'login'
        ? await authService.login(authModalForm.email, authModalForm.password)
        : await authService.createAccount(
            authModalForm.email,
            authModalForm.password,
            authModalForm.firstName,
            authModalForm.lastName,
            authModalForm.userName,
            authModalForm.dateOfBirth,
          );

      if (!authResult.user || !authResult.profile) {
        throw new Error('Failed to retrieve user profile data.');
      }

      setAuthUser(authResult.user);
      setUser(authResult.profile);
      setShowAuthModal(false);
      await startProductCheckout(activeProduct, authResult.profile);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'EMAIL_NOT_VERIFIED') {
        const pendingEmail = error.email || authModalForm.email.trim().toLowerCase();
        setAuthVerificationEmail(pendingEmail);
        setAuthVerificationMessage(error.message || 'Please verify your email before signing in.');
        setAuthVerificationMessageType('info');
        setAuthModalError('');
        return;
      }
      setAuthModalError(error instanceof Error ? error.message : 'Authentication failed.');
    } finally {
      setAuthModalLoading(false);
    }
  }, [activeProduct, authModalForm, authModalMode, resetAuthModalFeedback, setAuthUser, setUser, startProductCheckout]);

  useEffect(() => {
    if (authLoading || !user) {
      return;
    }
    const pendingProductId = readPendingCheckoutProductId();
    if (!pendingProductId) {
      return;
    }
    const pendingProduct = products.find((product) => product.id === pendingProductId);
    if (!pendingProduct) {
      clearPendingCheckoutProductId();
      return;
    }
    void startProductCheckout(pendingProduct, user);
  }, [authLoading, products, startProductCheckout, user]);

  return (
    <>
      <div className={styles.grid}>
        {products.map((product) => {
          const isStarting = startingProductId === product.id;
          const actionLabel = authLoading
            ? 'Checking session...'
            : user
              ? 'Buy now'
              : 'Registration required';

          return (
            <div key={product.id} className={styles.item}>
              <div className={styles.itemBody}>
                <h3 className={styles.itemTitle}>{product.name}</h3>
                {product.description ? <p className={styles.itemMeta}>{product.description}</p> : null}
                <p className={styles.itemMeta}>{getProductPriceLabel(product)}</p>
                <button
                  type="button"
                  className={styles.itemButton}
                  disabled={authLoading || isStarting}
                  onClick={() => { void startProductCheckout(product); }}
                >
                  {isStarting ? 'Opening payment...' : actionLabel}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <Modal
        opened={showAuthModal}
        onClose={closeAuthModal}
        centered
        title={authModalMode === 'login' ? 'Sign in to purchase' : 'Create account to purchase'}
      >
        <form onSubmit={handleAuthModalSubmit}>
          <Stack gap="sm">
            <Text size="sm" c="dimmed">
              {authModalMode === 'login'
                ? 'Sign in to continue with checkout.'
                : 'Create an account to continue with checkout.'}
            </Text>
            {authModalMode === 'signup' ? (
              <>
                <TextInput
                  label="First name"
                  value={authModalForm.firstName}
                  onChange={(changeEvent) => handleAuthModalInputChange('firstName', changeEvent.currentTarget.value)}
                  required
                />
                <TextInput
                  label="Last name"
                  value={authModalForm.lastName}
                  onChange={(changeEvent) => handleAuthModalInputChange('lastName', changeEvent.currentTarget.value)}
                  required
                />
                <TextInput
                  label="Username"
                  value={authModalForm.userName}
                  onChange={(changeEvent) => handleAuthModalInputChange('userName', changeEvent.currentTarget.value)}
                  required
                />
                <TextInput
                  label="Date of birth"
                  type="date"
                  value={authModalForm.dateOfBirth}
                  onChange={(changeEvent) => handleAuthModalInputChange('dateOfBirth', changeEvent.currentTarget.value)}
                  max={maxAuthDob}
                  required
                />
              </>
            ) : null}
            <TextInput
              label="Email address"
              type="email"
              value={authModalForm.email}
              onChange={(changeEvent) => handleAuthModalInputChange('email', changeEvent.currentTarget.value)}
              required
            />
            <PasswordInput
              label="Password"
              value={authModalForm.password}
              onChange={(changeEvent) => handleAuthModalInputChange('password', changeEvent.currentTarget.value)}
              required
              minLength={8}
            />
            {authVerificationMessage ? (
              <Alert color={authVerificationMessageType === 'success' ? 'green' : 'yellow'} variant="light">
                <Text size="sm">{authVerificationMessage}</Text>
                {authVerificationEmail ? (
                  <Button
                    type="button"
                    variant="subtle"
                    size="compact-sm"
                    mt="xs"
                    loading={authResendingVerification}
                    onClick={() => { void handleAuthModalResendVerification(); }}
                  >
                    Resend verification email
                  </Button>
                ) : null}
              </Alert>
            ) : null}
            {authModalError ? (
              <Alert color="red" variant="light">
                {authModalError}
              </Alert>
            ) : null}
            <Button type="submit" fullWidth loading={authModalLoading}>
              {authModalMode === 'login' ? 'Sign in' : 'Create account'}
            </Button>
            <Button
              type="button"
              variant="subtle"
              onClick={() => {
                setAuthModalMode((current) => (current === 'login' ? 'signup' : 'login'));
                resetAuthModalFeedback();
              }}
            >
              {authModalMode === 'login'
                ? "Don't have an account? Sign up"
                : 'Already have an account? Sign in'}
            </Button>
            <Group gap="xs" align="center" wrap="nowrap">
              <div className={styles.authDivider} />
              <Text size="xs" c="dimmed">or</Text>
              <div className={styles.authDivider} />
            </Group>
            <Button
              type="button"
              fullWidth
              variant="default"
              onClick={() => { void handleAuthModalGoogle(); }}
              disabled={authModalLoading}
            >
              Continue with Google
            </Button>
          </Stack>
        </form>
      </Modal>

      <BillingAddressModal
        opened={showBillingAddressModal}
        onClose={() => setShowBillingAddressModal(false)}
        onSaved={async (billingAddress) => {
          if (activeProduct) {
            await startProductCheckout(activeProduct, user, billingAddress);
          }
        }}
        title="Billing address required"
        description="Enter your billing address so tax can be calculated before checkout."
      />

      <PaymentModal
        isOpen={showPaymentModal && Boolean(paymentData) && Boolean(activeProduct)}
        onClose={() => {
          setShowPaymentModal(false);
          setPaymentData(null);
        }}
        event={{
          name: activeProduct?.name ?? 'Product purchase',
          location: organization.name,
          eventType: 'EVENT',
          price: activeProduct?.priceCents ?? 0,
        }}
        paymentData={paymentData}
        onPaymentSuccess={() => {
          const completedProduct = activeProduct;
          notifications.show({
            color: 'green',
            message: completedProduct ? `Purchase completed for ${completedProduct.name}.` : 'Purchase completed.',
          });
          setShowPaymentModal(false);
          setPaymentData(null);
          navigateToPublicCompletion({
            router,
            slug,
            kind: 'product',
            redirectUrl: organization.publicCompletionRedirectUrl,
          });
        }}
      />
    </>
  );
}
