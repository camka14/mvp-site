'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Button,
  Container,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useApp } from '@/app/providers';
import FieldsTabContent, {
  type RentalSelectionCheckoutPayload,
} from '@/app/organizations/[id]/FieldsTabContent';
import BillingAddressModal from '@/components/ui/BillingAddressModal';
import PaymentModal from '@/components/ui/PaymentModal';
import { apiRequest, isApiRequestError } from '@/lib/apiClient';
import { paymentService } from '@/lib/paymentService';
import { navigateToPublicCompletion } from '@/lib/publicCompletionRedirect';
import type { BillingAddress, Event, Organization, PaymentIntent, TimeSlot } from '@/types';
import { formatPrice } from '@/types';

type RentalPaymentDraft = {
  event: Event;
  timeSlot: TimeSlot;
};

const getPaymentIntentId = (clientSecret: string | undefined): string | null => {
  if (!clientSecret) {
    return null;
  }
  const secretIndex = clientSecret.indexOf('_secret_');
  return secretIndex > 0 ? clientSecret.slice(0, secretIndex) : clientSecret;
};

const normalizeOrganizationSports = (sports: string[] | undefined): string[] => (
  Array.isArray(sports)
    ? Array.from(new Set(
        sports
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0),
      ))
    : []
);

const buildRentalPaymentDraft = (
  organization: Organization,
  payload: RentalSelectionCheckoutPayload,
  userId: string,
  sportId: string | null,
): RentalPaymentDraft => {
  const timeSlotId = `${payload.eventId}-rental-payment`;
  const fallbackCoordinates = payload.coordinates ?? organization.coordinates ?? [0, 0];
  const event = {
    $id: payload.eventId,
    name: organization.name,
    description: `Private rental order for ${organization.name}.`,
    start: payload.rentalStart,
    end: payload.rentalEnd,
    location: payload.location || organization.location || 'Rental',
    address: organization.address,
    coordinates: fallbackCoordinates,
    price: 0,
    imageId: '',
    hostId: userId,
    state: 'PRIVATE',
    maxParticipants: 10,
    teamSizeLimit: 10,
    teamSignup: false,
    singleDivision: true,
    waitListIds: [],
    freeAgentIds: [],
    teamIds: [],
    userIds: [],
    fieldIds: payload.fieldIds,
    timeSlotIds: [timeSlotId],
    officialIds: [],
    assistantHostIds: [],
    cancellationRefundHours: 24,
    registrationCutoffHours: 0,
    seedColor: 0,
    eventType: 'EVENT',
    organizationId: organization.$id,
    sportId,
    divisions: [],
    requiredTemplateIds: [],
    noFixedEndDateTime: false,
  } as unknown as Event;

  const timeSlot: TimeSlot = {
    $id: timeSlotId,
    startDate: payload.rentalStart,
    endDate: payload.rentalEnd,
    repeating: false,
    price: Math.max(0, Math.round(payload.totalRentalCents)),
    scheduledFieldId: payload.primaryFieldId ?? payload.fieldIds[0],
    scheduledFieldIds: payload.fieldIds,
    requiredTemplateIds: payload.requiredTemplateIds,
    hostRequiredTemplateIds: payload.hostRequiredTemplateIds,
    divisions: [],
    daysOfWeek: [],
  };

  return { event, timeSlot };
};

type PublicRentalSelectionClientProps = {
  slug: string;
  organization: Organization;
};

export default function PublicRentalSelectionClient({ slug, organization }: PublicRentalSelectionClientProps) {
  const router = useRouter();
  const { user, loading: authLoading } = useApp();
  const [pendingSelection, setPendingSelection] = useState<RentalSelectionCheckoutPayload | null>(null);
  const [choiceOpen, setChoiceOpen] = useState(false);
  const [showSportPrompt, setShowSportPrompt] = useState(false);
  const [startingCheckout, setStartingCheckout] = useState(false);
  const [showBillingAddressModal, setShowBillingAddressModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentData, setPaymentData] = useState<PaymentIntent | null>(null);
  const [paymentDraft, setPaymentDraft] = useState<RentalPaymentDraft | null>(null);
  const [orderCompleteMessage, setOrderCompleteMessage] = useState<string | null>(null);
  const [selectedSportId, setSelectedSportId] = useState<string | null>(null);

  const returnHref = `/o/${encodeURIComponent(slug)}`;
  const fieldsCount = organization.fields?.length ?? 0;
  const availableSports = useMemo(
    () => normalizeOrganizationSports(organization.sports),
    [organization.sports],
  );
  const defaultSportId = availableSports.length === 1 ? availableSports[0] : null;
  const sportOptions = useMemo(
    () => availableSports.map((sport) => ({ value: sport, label: sport })),
    [availableSports],
  );

  const paymentEvent = useMemo(() => ({
    name: `${organization.name} rental`,
    location: pendingSelection?.location || organization.location || '',
    eventType: 'EVENT' as const,
    price: pendingSelection?.totalRentalCents ?? 0,
  }), [organization.location, organization.name, pendingSelection?.location, pendingSelection?.totalRentalCents]);

  const createRentalOrder = useCallback(async (
    payload: RentalSelectionCheckoutPayload,
    paymentIntentId: string | null,
    sportId: string | null,
  ) => {
    const result = await apiRequest<{ eventId: string; totalCents: number }>(
      `/api/public/organizations/${encodeURIComponent(slug)}/rental-orders`,
      {
        method: 'POST',
        body: {
          eventId: payload.eventId,
          selections: payload.rentalSelections,
          sportId,
          paymentIntentId,
        },
        timeoutMs: 30_000,
      },
    );
    const message = `Rental ordered for ${organization.name}.`;
    setOrderCompleteMessage(message);
    notifications.show({ color: 'green', message });
    return result;
  }, [organization.name, slug]);

  const completeRentalOrder = useCallback(async (
    payload: RentalSelectionCheckoutPayload,
    paymentIntentId: string | null,
    sportId: string | null,
  ) => {
    const result = await createRentalOrder(payload, paymentIntentId, sportId);
    navigateToPublicCompletion({
      router,
      slug,
      kind: 'rental',
      redirectUrl: organization.publicCompletionRedirectUrl,
    });
    return result;
  }, [createRentalOrder, organization.publicCompletionRedirectUrl, router, slug]);

  const clearCheckoutState = useCallback(() => {
    setChoiceOpen(false);
    setShowSportPrompt(false);
    setShowPaymentModal(false);
    setShowBillingAddressModal(false);
    setPaymentData(null);
    setPaymentDraft(null);
    setPendingSelection(null);
    setSelectedSportId(null);
  }, []);

  const releasePaymentDraftLock = useCallback(async () => {
    if (!paymentDraft) {
      return;
    }
    try {
      await paymentService.releaseRentalCheckoutLock(paymentDraft.event, paymentDraft.timeSlot);
    } catch (error) {
      console.warn('Failed to release public rental checkout lock', error);
    }
  }, [paymentDraft]);

  const startRentalOnlyCheckout = useCallback(async (billingAddress?: BillingAddress) => {
    if (!pendingSelection) {
      return;
    }
    if (availableSports.length > 0 && !selectedSportId) {
      notifications.show({ color: 'yellow', message: 'Select a sport for this rental event.' });
      return;
    }
    if (!user) {
      notifications.show({ color: 'yellow', message: 'Sign in to order this rental.' });
      router.push('/login');
      return;
    }

    const draft = buildRentalPaymentDraft(organization, pendingSelection, user.$id, selectedSportId);
    setPaymentDraft(draft);
    setStartingCheckout(true);
    try {
      if (pendingSelection.totalRentalCents <= 0) {
        await completeRentalOrder(pendingSelection, null, selectedSportId);
        clearCheckoutState();
        return;
      }

      const intent = await paymentService.createPaymentIntent(
        user,
        draft.event,
        undefined,
        draft.timeSlot,
        { $id: organization.$id, name: organization.name },
        undefined,
        billingAddress,
      );
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
      console.error('Failed to start public rental checkout', error);
      notifications.show({
        color: 'red',
        message: error instanceof Error ? error.message : 'Unable to start rental checkout.',
      });
    } finally {
      setStartingCheckout(false);
    }
  }, [availableSports.length, clearCheckoutState, completeRentalOrder, organization, pendingSelection, router, selectedSportId, user]);

  const handlePaymentSuccess = useCallback(async () => {
    if (!pendingSelection || !paymentData) {
      return;
    }
    const paymentIntentId = getPaymentIntentId(paymentData.paymentIntent);
    await completeRentalOrder(pendingSelection, paymentIntentId, selectedSportId);
    await releasePaymentDraftLock();
    clearCheckoutState();
  }, [clearCheckoutState, completeRentalOrder, paymentData, pendingSelection, releasePaymentDraftLock, selectedSportId]);

  const closePaymentModal = useCallback(async () => {
    setShowPaymentModal(false);
    setPaymentData(null);
    await releasePaymentDraftLock();
    setPaymentDraft(null);
  }, [releasePaymentDraftLock]);

  const handleSelectionReady = useCallback((payload: RentalSelectionCheckoutPayload) => {
    setOrderCompleteMessage(null);
    setPendingSelection(payload);
    setShowSportPrompt(false);
    setSelectedSportId(defaultSportId);
    setChoiceOpen(true);
  }, [defaultSportId]);

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        <div>
          <Text size="sm" c="dimmed">Rental selection</Text>
          <Title order={1}>{organization.name}</Title>
          <Text c="dimmed">Select field rental times, then choose how you want to finish the order.</Text>
        </div>

        {!authLoading && !user ? (
          <Alert color="yellow" title="Sign in required">
            <Group justify="space-between" align="center">
              <Text size="sm">Sign in before ordering a rental or creating a BracketIQ event from a rental.</Text>
              <Button size="sm" onClick={() => router.push('/login')}>Sign in</Button>
            </Group>
          </Alert>
        ) : null}

        {orderCompleteMessage ? (
          <Alert color="green" title="Rental ordered">{orderCompleteMessage}</Alert>
        ) : null}

        {fieldsCount === 0 ? (
          <Alert color="yellow" title="No rentals available">
            This organization does not have public rental slots available right now.
          </Alert>
        ) : null}

        <FieldsTabContent
          organization={organization}
          organizationId={organization.$id}
          currentUser={user}
          backHref={returnHref}
          backLabel="Back to organization"
          primaryActionLabel="Continue"
          onRentalSelectionReady={handleSelectionReady}
        />
      </Stack>

      <Modal
        opened={choiceOpen}
        onClose={() => {
          setChoiceOpen(false);
          setShowSportPrompt(false);
        }}
        title={showSportPrompt ? 'Rental sport' : 'Finish rental'}
        centered
        size="lg"
      >
        <Stack gap="md">
          {pendingSelection ? (
            <Group justify="space-between">
              <Text fw={600}>Rental total</Text>
              <Text fw={700}>{formatPrice(pendingSelection.totalRentalCents)}</Text>
            </Group>
          ) : null}
          {showSportPrompt ? (
            <>
              <Text>Select the sport for the private rental event.</Text>
              <Select
                label="Sport"
                placeholder="Select a sport"
                data={sportOptions}
                value={selectedSportId}
                onChange={setSelectedSportId}
                allowDeselect={false}
                withAsterisk
              />
              <Group justify="flex-end">
                <Button variant="default" onClick={() => setShowSportPrompt(false)}>Back</Button>
                <Button
                  loading={startingCheckout}
                  disabled={!selectedSportId}
                  onClick={() => void startRentalOnlyCheckout()}
                >
                  Continue to payment
                </Button>
              </Group>
            </>
          ) : (
            <>
              <Text>
                Manage this rental in BracketIQ to create a full event with registration, teams, divisions, and scheduling.
                Order rental only to reserve the selected field time after payment.
              </Text>
              {!availableSports.length ? (
                <Alert color="yellow" title="Sport required for rental-only orders">
                  Add at least one sport to this organization before offering rental-only checkout.
                </Alert>
              ) : null}
              <Group justify="flex-end">
                <Button variant="default" onClick={() => setChoiceOpen(false)}>Cancel</Button>
                <Button
                  variant="light"
                  onClick={() => {
                    if (pendingSelection) {
                      router.push(pendingSelection.manageEventUrl);
                    }
                  }}
                >
                  Manage in BracketIQ
                </Button>
                <Button
                  disabled={!availableSports.length}
                  onClick={() => setShowSportPrompt(true)}
                >
                  Order rental only
                </Button>
              </Group>
            </>
          )}
        </Stack>
      </Modal>

      <BillingAddressModal
        opened={showBillingAddressModal}
        onClose={() => setShowBillingAddressModal(false)}
        onSaved={async (billingAddress) => {
          await startRentalOnlyCheckout(billingAddress);
        }}
        title="Billing address required"
        description="Enter your billing address so tax can be calculated before checkout."
      />

      <PaymentModal
        isOpen={showPaymentModal && Boolean(paymentData)}
        onClose={() => void closePaymentModal()}
        event={paymentEvent}
        paymentData={paymentData}
        onPaymentSuccess={handlePaymentSuccess}
      />
    </Container>
  );
}
