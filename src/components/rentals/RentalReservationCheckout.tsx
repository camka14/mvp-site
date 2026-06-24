"use client";

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Group, Modal, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import BillingAddressModal from '@/components/ui/BillingAddressModal';
import PaymentModal from '@/components/ui/PaymentModal';
import { apiRequest, isApiRequestError } from '@/lib/apiClient';
import { paymentService } from '@/lib/paymentService';
import type { RentalSelectionCheckoutPayload } from '@/app/organizations/[id]/FieldsTabContent';
import type { BillingAddress, Event, Organization, PaymentIntent, TimeSlot, UserData } from '@/types';
import { formatPrice } from '@/types';

type RentalPaymentDraft = {
  event: Event;
  timeSlot: TimeSlot;
};

type RentalOrderItemResult = {
  id: string;
  fieldId: string;
  start: string;
  end: string;
};

type RentalOrderResult = {
  bookingId: string;
  billId?: string | null;
  eventId?: string | null;
  totalCents: number;
  items?: RentalOrderItemResult[];
  createEventUrl?: string;
};

type CompletedRentalOrder = RentalOrderResult & {
  createEventUrl: string;
};

type RentalReservationCheckoutRenderProps = {
  onRentalSelectionReady: (payload: RentalSelectionCheckoutPayload) => void;
};

type RentalReservationCheckoutProps = {
  organization: Organization;
  rentalOrderSlug?: string | null;
  currentUser: UserData | null;
  children: (props: RentalReservationCheckoutRenderProps) => ReactNode;
};

const RENTAL_EVENT_QUERY_KEYS = [
  'rentalStart',
  'rentalEnd',
  'rentalFieldId',
  'rentalFieldName',
  'rentalFacilityId',
  'rentalFacilityName',
  'rentalFacilityLocation',
  'rentalFacilityAddress',
  'rentalLocation',
  'rentalLat',
  'rentalLng',
  'rentalPriceCents',
  'rentalRequiredTemplateIds',
  'rentalHostRequiredTemplateIds',
  'rentalSelections',
  'rentalBookingId',
  'rentalBookingItems',
  'rentalOrgId',
];

const stripRentalQueryParams = (manageEventUrl: string): string => {
  const url = new URL(manageEventUrl, 'http://localhost');
  RENTAL_EVENT_QUERY_KEYS.forEach((key) => url.searchParams.delete(key));
  return `${url.pathname}${url.search}`;
};

const getPaymentIntentId = (clientSecret: string | undefined): string | null => {
  if (!clientSecret) {
    return null;
  }
  const secretIndex = clientSecret.indexOf('_secret_');
  return secretIndex > 0 ? clientSecret.slice(0, secretIndex) : clientSecret;
};

const buildRentalPaymentDraft = (
  organization: Organization,
  payload: RentalSelectionCheckoutPayload,
  userId: string,
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
    address: payload.facilityAddress ?? organization.address,
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
    sportId: null,
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

export default function RentalReservationCheckout({
  organization,
  rentalOrderSlug,
  currentUser,
  children,
}: RentalReservationCheckoutProps) {
  const router = useRouter();
  const [pendingSelection, setPendingSelection] = useState<RentalSelectionCheckoutPayload | null>(null);
  const [choiceOpen, setChoiceOpen] = useState(false);
  const [startingCheckout, setStartingCheckout] = useState(false);
  const [showBillingAddressModal, setShowBillingAddressModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentData, setPaymentData] = useState<PaymentIntent | null>(null);
  const [paymentDraft, setPaymentDraft] = useState<RentalPaymentDraft | null>(null);
  const [orderCompleteMessage, setOrderCompleteMessage] = useState<string | null>(null);
  const [completedRentalOrder, setCompletedRentalOrder] = useState<CompletedRentalOrder | null>(null);

  const normalizedRentalOrderSlug = typeof rentalOrderSlug === 'string' ? rentalOrderSlug.trim() : '';
  const paymentEvent = useMemo(() => ({
    name: `${organization.name} rental`,
    location: pendingSelection?.location || pendingSelection?.facilityLocation || organization.location || '',
    eventType: 'EVENT' as const,
    price: pendingSelection?.totalRentalCents ?? 0,
  }), [
    organization.location,
    organization.name,
    pendingSelection?.facilityLocation,
    pendingSelection?.location,
    pendingSelection?.totalRentalCents,
  ]);

  const createRentalOrder = useCallback(async (
    payload: RentalSelectionCheckoutPayload,
    paymentIntentId: string | null,
  ) => {
    if (!normalizedRentalOrderSlug) {
      throw new Error('This organization needs a public rental checkout before resources can be reserved.');
    }
    const result = await apiRequest<RentalOrderResult>(
      `/api/public/organizations/${encodeURIComponent(normalizedRentalOrderSlug)}/rental-orders`,
      {
        method: 'POST',
        body: {
          eventId: payload.eventId,
          selections: payload.rentalSelections,
          paymentIntentId,
          renterOrganizationId: payload.renterOrganizationId,
        },
        timeoutMs: 30_000,
      },
    );
    const createEventUrl = typeof result.createEventUrl === 'string' && result.createEventUrl.trim().length > 0
      ? result.createEventUrl
      : stripRentalQueryParams(payload.manageEventUrl);
    const message = `Resources reserved for ${organization.name}.`;
    setOrderCompleteMessage(message);
    setCompletedRentalOrder({
      ...result,
      createEventUrl,
    });
    notifications.show({ color: 'green', message });
    return { ...result, createEventUrl };
  }, [normalizedRentalOrderSlug, organization.name]);

  const completeRentalOrder = useCallback(async (
    payload: RentalSelectionCheckoutPayload,
    paymentIntentId: string | null,
  ) => {
    const result = await createRentalOrder(payload, paymentIntentId);
    setChoiceOpen(false);
    return result;
  }, [createRentalOrder]);

  const clearCheckoutState = useCallback(() => {
    setChoiceOpen(false);
    setShowPaymentModal(false);
    setShowBillingAddressModal(false);
    setPaymentData(null);
    setPaymentDraft(null);
    setPendingSelection(null);
  }, []);

  const releasePaymentDraftLock = useCallback(async () => {
    if (!paymentDraft) {
      return;
    }
    try {
      await paymentService.releaseRentalCheckoutLock(paymentDraft.event, paymentDraft.timeSlot);
    } catch (error) {
      console.warn('Failed to release rental checkout lock', error);
    }
  }, [paymentDraft]);

  const startRentalOnlyCheckout = useCallback(async (billingAddress?: BillingAddress) => {
    if (!pendingSelection) {
      return;
    }
    if (!currentUser) {
      notifications.show({ color: 'yellow', message: 'Sign in to order this rental.' });
      router.push('/login');
      return;
    }

    const draft = buildRentalPaymentDraft(organization, pendingSelection, currentUser.$id);
    setPaymentDraft(draft);
    setStartingCheckout(true);
    try {
      if (pendingSelection.totalRentalCents <= 0) {
        await completeRentalOrder(pendingSelection, null);
        clearCheckoutState();
        return;
      }

      const intent = await paymentService.createPaymentIntent(
        currentUser,
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
      console.error('Failed to start rental checkout', error);
      notifications.show({
        color: 'red',
        message: error instanceof Error ? error.message : 'Unable to start rental checkout.',
      });
    } finally {
      setStartingCheckout(false);
    }
  }, [clearCheckoutState, completeRentalOrder, currentUser, organization, pendingSelection, router]);

  const handlePaymentSuccess = useCallback(async () => {
    if (!pendingSelection || !paymentData) {
      return;
    }
    const paymentIntentId = getPaymentIntentId(paymentData.paymentIntent);
    await completeRentalOrder(pendingSelection, paymentIntentId);
    await releasePaymentDraftLock();
    clearCheckoutState();
  }, [clearCheckoutState, completeRentalOrder, paymentData, pendingSelection, releasePaymentDraftLock]);

  const closePaymentModal = useCallback(async () => {
    setShowPaymentModal(false);
    setPaymentData(null);
    await releasePaymentDraftLock();
    setPaymentDraft(null);
  }, [releasePaymentDraftLock]);

  const handleSelectionReady = useCallback((payload: RentalSelectionCheckoutPayload) => {
    if (!normalizedRentalOrderSlug) {
      notifications.show({
        color: 'red',
        message: 'This organization needs a public rental checkout before resources can be reserved.',
      });
      return;
    }
    setOrderCompleteMessage(null);
    setCompletedRentalOrder(null);
    setPendingSelection(payload);
    setChoiceOpen(true);
  }, [normalizedRentalOrderSlug]);

  return (
    <>
      {orderCompleteMessage ? (
        <Alert color="green" title="Resources reserved">
          <Stack gap="sm">
            <Text size="sm">{orderCompleteMessage}</Text>
            {completedRentalOrder ? (
              <Group gap="sm">
                <Button size="sm" onClick={() => router.push(completedRentalOrder.createEventUrl)}>
                  Create event now
                </Button>
                <Button size="sm" variant="default" onClick={() => setOrderCompleteMessage(null)}>
                  Attach to event later
                </Button>
              </Group>
            ) : null}
          </Stack>
        </Alert>
      ) : null}

      {children({ onRentalSelectionReady: handleSelectionReady })}

      <Modal
        opened={choiceOpen}
        onClose={() => setChoiceOpen(false)}
        title="Reserve resources"
        centered
        size="lg"
      >
        <Stack gap="md">
          {pendingSelection ? (
            <Stack gap={4}>
              <Group justify="space-between">
                <Text fw={600}>Rental total</Text>
                <Text fw={700}>{formatPrice(pendingSelection.totalRentalCents)}</Text>
              </Group>
              {pendingSelection.facilityName ? (
                <Text size="sm">
                  <Text span fw={600}>Facility:</Text> {pendingSelection.facilityName}
                </Text>
              ) : null}
              {pendingSelection.primaryFieldName ? (
                <Text size="sm">
                  <Text span fw={600}>Resource:</Text> {pendingSelection.primaryFieldName}
                  {pendingSelection.fieldIds.length > 1 ? ` + ${pendingSelection.fieldIds.length - 1} more` : ''}
                </Text>
              ) : null}
              {pendingSelection.location || pendingSelection.facilityLocation ? (
                <Text size="sm" c="dimmed">
                  {pendingSelection.location || pendingSelection.facilityLocation}
                </Text>
              ) : null}
            </Stack>
          ) : null}
          <Text>
            Continue to complete any required documents and payment. After checkout, these resources are reserved and can be attached to an event.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setChoiceOpen(false)}>Cancel</Button>
            <Button
              loading={startingCheckout}
              onClick={() => void startRentalOnlyCheckout()}
            >
              Continue to checkout
            </Button>
          </Group>
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
    </>
  );
}
