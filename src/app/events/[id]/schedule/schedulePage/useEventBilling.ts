import { useCallback, useEffect, useMemo, useState } from 'react';

import { apiRequest } from '@/lib/apiClient';
import { calculateMvpAndStripeFees } from '@/lib/billingFees';
import type { Event, Team } from '@/types';

import { normalizeIdToken, type TeamBillingSnapshot } from './helpers';

type UseEventBillingParams = {
  activeEventId?: string | null;
  fallbackEventId?: string | null;
  eventType?: Event['eventType'] | null;
  teamSignup?: boolean | null;
  appendSelectedOccurrenceQuery: (path: string) => string;
  refreshTeamCompliance: () => void;
  setInfoMessage: (message: string | null) => void;
};

export default function useEventBilling({
  activeEventId,
  fallbackEventId,
  eventType,
  teamSignup,
  appendSelectedOccurrenceQuery,
  refreshTeamCompliance,
  setInfoMessage,
}: UseEventBillingParams) {
  const [selectedRefundTeam, setSelectedRefundTeam] = useState<Team | null>(null);
  const [refundSnapshot, setRefundSnapshot] = useState<TeamBillingSnapshot | null>(null);
  const [refundLoading, setRefundLoading] = useState(false);
  const [refundError, setRefundError] = useState<string | null>(null);
  const [refundAmountDraftByPaymentId, setRefundAmountDraftByPaymentId] = useState<Record<string, number>>({});
  const [refundingPaymentId, setRefundingPaymentId] = useState<string | null>(null);
  const [cancellingPendingBillPaymentId, setCancellingPendingBillPaymentId] = useState<string | null>(null);
  const [createBillTeam, setCreateBillTeam] = useState<Team | null>(null);
  const [createBillError, setCreateBillError] = useState<string | null>(null);
  const [creatingBill, setCreatingBill] = useState(false);
  const [createBillOwnerType, setCreateBillOwnerType] = useState<'TEAM' | 'USER'>('TEAM');
  const [createBillOwnerId, setCreateBillOwnerId] = useState<string | null>(null);
  const [createBillAmountDollars, setCreateBillAmountDollars] = useState<number>(0);
  const [createBillTaxDollars, setCreateBillTaxDollars] = useState<number>(0);
  const [createBillAllowSplit, setCreateBillAllowSplit] = useState(false);
  const [createBillLabel, setCreateBillLabel] = useState('Event registration');

  const targetEventId = activeEventId ?? fallbackEventId ?? null;

  const loadTeamBillingSnapshot = useCallback(
    async (teamId: string): Promise<TeamBillingSnapshot> => {
      if (!targetEventId) {
        throw new Error('Event context is unavailable.');
      }
      return apiRequest<TeamBillingSnapshot>(
        appendSelectedOccurrenceQuery(`/api/events/${targetEventId}/teams/${teamId}/billing`),
      );
    },
    [appendSelectedOccurrenceQuery, targetEventId],
  );

  const closeRefundModal = useCallback(() => {
    setSelectedRefundTeam(null);
    setRefundSnapshot(null);
    setRefundError(null);
    setRefundLoading(false);
    setRefundAmountDraftByPaymentId({});
    setRefundingPaymentId(null);
    setCancellingPendingBillPaymentId(null);
  }, []);

  const openRefundModal = useCallback(
    async (team: Team) => {
      if (!team?.$id) {
        return;
      }
      setSelectedRefundTeam(team);
      setRefundLoading(true);
      setRefundError(null);
      setRefundSnapshot(null);
      try {
        const snapshot = await loadTeamBillingSnapshot(team.$id);
        setRefundSnapshot(snapshot);
        const defaults: Record<string, number> = {};
        snapshot.bills.forEach((bill) => {
          bill.payments.forEach((payment) => {
            defaults[payment.$id] = payment.refundableAmountCents / 100;
          });
        });
        setRefundAmountDraftByPaymentId(defaults);
      } catch (error) {
        console.error('Failed to load team billing snapshot:', error);
        setRefundError(error instanceof Error ? error.message : 'Failed to load billing details.');
      } finally {
        setRefundLoading(false);
      }
    },
    [loadTeamBillingSnapshot],
  );

  const submitRefund = useCallback(
    async (paymentId: string) => {
      const team = selectedRefundTeam;
      if (!team?.$id || !targetEventId) {
        return;
      }
      const payment = refundSnapshot?.bills
        .flatMap((bill) => bill.payments)
        .find((entry) => entry.$id === paymentId);
      if (!payment) {
        return;
      }
      const amountDollars = refundAmountDraftByPaymentId[paymentId] ?? (payment.refundableAmountCents / 100);
      const amountCents = Math.round((Number(amountDollars) || 0) * 100);
      if (!Number.isFinite(amountCents) || amountCents <= 0) {
        setRefundError('Enter a refund amount greater than $0.00.');
        return;
      }

      setRefundingPaymentId(paymentId);
      setRefundError(null);
      try {
        await apiRequest(
          appendSelectedOccurrenceQuery(`/api/events/${targetEventId}/teams/${team.$id}/billing/refunds`),
          {
            method: 'POST',
            body: {
              billPaymentId: paymentId,
              amountCents,
            },
          },
        );
        const snapshot = await loadTeamBillingSnapshot(team.$id);
        setRefundSnapshot(snapshot);
        const nextDefaults: Record<string, number> = {};
        snapshot.bills.forEach((bill) => {
          bill.payments.forEach((entry) => {
            nextDefaults[entry.$id] = entry.refundableAmountCents / 100;
          });
        });
        setRefundAmountDraftByPaymentId(nextDefaults);
        setInfoMessage('Refund processed successfully.');
        refreshTeamCompliance();
      } catch (error) {
        console.error('Failed to process refund:', error);
        setRefundError(error instanceof Error ? error.message : 'Failed to process refund.');
      } finally {
        setRefundingPaymentId(null);
      }
    },
    [
      appendSelectedOccurrenceQuery,
      loadTeamBillingSnapshot,
      refundAmountDraftByPaymentId,
      refundSnapshot?.bills,
      refreshTeamCompliance,
      selectedRefundTeam,
      setInfoMessage,
      targetEventId,
    ],
  );

  const cancelPendingBillPayment = useCallback(
    async (billId: string, paymentId: string) => {
      const team = selectedRefundTeam;
      if (!team?.$id) {
        return;
      }
      setCancellingPendingBillPaymentId(paymentId);
      setRefundError(null);
      try {
        await apiRequest(`/api/billing/bills/${billId}/payments/${paymentId}/cancel`, {
          method: 'POST',
        });
        const snapshot = await loadTeamBillingSnapshot(team.$id);
        setRefundSnapshot(snapshot);
        setInfoMessage('Pending payment cancelled.');
        refreshTeamCompliance();
      } catch (error) {
        console.error('Failed to cancel pending bill payment:', error);
        setRefundError(error instanceof Error ? error.message : 'Failed to cancel pending payment.');
      } finally {
        setCancellingPendingBillPaymentId(null);
      }
    },
    [loadTeamBillingSnapshot, refreshTeamCompliance, selectedRefundTeam, setInfoMessage],
  );

  const closeCreateBillModal = useCallback(() => {
    setCreateBillTeam(null);
    setCreateBillError(null);
    setCreatingBill(false);
    setCreateBillOwnerType('TEAM');
    setCreateBillOwnerId(null);
    setCreateBillAmountDollars(0);
    setCreateBillTaxDollars(0);
    setCreateBillAllowSplit(false);
    setCreateBillLabel('Event registration');
  }, []);

  const openCreateBillModal = useCallback((team: Team) => {
    if (!team?.$id) {
      return;
    }
    const userOnlyBilling = teamSignup === false;
    const defaultOwnerType: 'TEAM' | 'USER' = userOnlyBilling ? 'USER' : 'TEAM';
    const defaultOwnerId = defaultOwnerType === 'TEAM'
      ? (normalizeIdToken(team.parentTeamId) ?? team.$id)
      : (Array.isArray(team.playerIds) && team.playerIds.length > 0 ? team.playerIds[0] : team.$id);

    setCreateBillTeam(team);
    setCreateBillError(null);
    setCreatingBill(false);
    setCreateBillOwnerType(defaultOwnerType);
    setCreateBillOwnerId(defaultOwnerId);
    setCreateBillAmountDollars(0);
    setCreateBillTaxDollars(0);
    setCreateBillAllowSplit(false);
    setCreateBillLabel('Event registration');
  }, [teamSignup]);

  const createBillUserOptions = useMemo(() => {
    if (!createBillTeam) {
      return [] as Array<{ value: string; label: string }>;
    }
    const fromPlayers = Array.isArray(createBillTeam.players)
      ? createBillTeam.players
          .map((player) => {
            const playerId = normalizeIdToken(player?.$id);
            if (!playerId) {
              return null;
            }
            const fullName = typeof player.fullName === 'string' && player.fullName.trim().length > 0
              ? player.fullName.trim()
              : `${player.firstName ?? ''} ${player.lastName ?? ''}`.trim();
            return {
              value: playerId,
              label: fullName || player.userName || playerId,
            };
          })
          .filter((option): option is { value: string; label: string } => Boolean(option))
      : [];
    if (fromPlayers.length > 0) {
      return fromPlayers;
    }
    const fallbackPlayerIds = Array.isArray(createBillTeam.playerIds)
      ? createBillTeam.playerIds
        .map((playerId) => normalizeIdToken(playerId))
        .filter((playerId): playerId is string => Boolean(playerId))
      : [];
    return fallbackPlayerIds.map((playerId) => ({
      value: playerId,
      label: playerId,
    }));
  }, [createBillTeam]);

  const createBillIsUserOnly = Boolean(createBillTeam && teamSignup === false);

  useEffect(() => {
    if (createBillIsUserOnly) {
      if (createBillOwnerType !== 'USER') {
        setCreateBillOwnerType('USER');
      }
      const firstUserId = createBillUserOptions[0]?.value ?? createBillTeam?.$id ?? null;
      if (firstUserId && createBillOwnerId !== firstUserId) {
        setCreateBillOwnerId(firstUserId);
      }
      return;
    }

    if (!createBillTeam) {
      return;
    }
    if (createBillOwnerType === 'TEAM') {
      const teamBillOwnerId = normalizeIdToken(createBillTeam.parentTeamId) ?? createBillTeam.$id;
      if (createBillOwnerId !== teamBillOwnerId) {
        setCreateBillOwnerId(teamBillOwnerId);
      }
      return;
    }
    const firstUserId = createBillUserOptions[0]?.value ?? null;
    if (firstUserId && createBillOwnerId !== firstUserId) {
      setCreateBillOwnerId(firstUserId);
    }
  }, [createBillIsUserOnly, createBillOwnerId, createBillOwnerType, createBillTeam, createBillUserOptions]);

  const createBillEventAmountCents = Math.max(0, Math.round((Number(createBillAmountDollars) || 0) * 100));
  const createBillFeeBreakdown = useMemo(
    () => calculateMvpAndStripeFees({
      eventAmountCents: createBillEventAmountCents,
      eventType: eventType ?? undefined,
    }),
    [createBillEventAmountCents, eventType],
  );
  const createBillMvpFeeAmountCents = createBillFeeBreakdown.mvpFeeCents;
  const createBillStripeFeeAmountCents = createBillFeeBreakdown.stripeFeeCents;
  const createBillTaxAmountCents = Math.max(0, Math.round((Number(createBillTaxDollars) || 0) * 100));
  const createBillTotalCents = (
    createBillEventAmountCents
    + createBillMvpFeeAmountCents
    + createBillStripeFeeAmountCents
    + createBillTaxAmountCents
  );
  const createBillPreviewLineItems = useMemo(() => {
    const lineItems: Array<{ id: string; label: string; amountCents: number }> = [
      {
        id: 'line_1',
        label: createBillLabel.trim().length > 0 ? createBillLabel.trim() : 'Event registration',
        amountCents: createBillEventAmountCents,
      },
    ];
    if (createBillMvpFeeAmountCents > 0) {
      lineItems.push({
        id: `line_${lineItems.length + 1}`,
        label: 'BracketIQ fee',
        amountCents: createBillMvpFeeAmountCents,
      });
    }
    if (createBillStripeFeeAmountCents > 0) {
      lineItems.push({
        id: `line_${lineItems.length + 1}`,
        label: 'Stripe fee',
        amountCents: createBillStripeFeeAmountCents,
      });
    }
    if (createBillTaxAmountCents > 0) {
      lineItems.push({
        id: `line_${lineItems.length + 1}`,
        label: 'Tax',
        amountCents: createBillTaxAmountCents,
      });
    }
    return lineItems;
  }, [
    createBillEventAmountCents,
    createBillLabel,
    createBillMvpFeeAmountCents,
    createBillStripeFeeAmountCents,
    createBillTaxAmountCents,
  ]);

  const submitCreateBill = useCallback(async () => {
    const team = createBillTeam;
    if (!team?.$id || !targetEventId) {
      return;
    }
    if (createBillEventAmountCents <= 0) {
      setCreateBillError('Enter an amount greater than $0.00.');
      return;
    }
    if (createBillOwnerType === 'USER' && !createBillOwnerId) {
      setCreateBillError('Select a user to bill.');
      return;
    }

    setCreatingBill(true);
    setCreateBillError(null);
    try {
      await apiRequest(
        appendSelectedOccurrenceQuery(`/api/events/${targetEventId}/teams/${team.$id}/billing/bills`),
        {
          method: 'POST',
          body: {
            ownerType: createBillOwnerType,
            ownerId: createBillOwnerType === 'TEAM'
              ? (normalizeIdToken(team.parentTeamId) ?? team.$id)
              : createBillOwnerId,
            eventAmountCents: createBillEventAmountCents,
            taxAmountCents: createBillTaxAmountCents,
            allowSplit: createBillOwnerType === 'TEAM' ? createBillAllowSplit : false,
            label: createBillLabel,
          },
        },
      );
      setInfoMessage('Bill created successfully.');
      closeCreateBillModal();
      refreshTeamCompliance();
    } catch (error) {
      console.error('Failed to create bill:', error);
      setCreateBillError(error instanceof Error ? error.message : 'Failed to create bill.');
    } finally {
      setCreatingBill(false);
    }
  }, [
    appendSelectedOccurrenceQuery,
    closeCreateBillModal,
    createBillAllowSplit,
    createBillEventAmountCents,
    createBillLabel,
    createBillOwnerId,
    createBillOwnerType,
    createBillTaxAmountCents,
    createBillTeam,
    refreshTeamCompliance,
    setInfoMessage,
    targetEventId,
  ]);

  const handleRefundAmountDraftChange = useCallback((paymentId: string, amountDollars: number) => {
    setRefundAmountDraftByPaymentId((current) => ({
      ...current,
      [paymentId]: amountDollars,
    }));
  }, []);

  return {
    selectedRefundTeam,
    refundSnapshot,
    refundLoading,
    refundError,
    refundAmountDraftByPaymentId,
    refundingPaymentId,
    cancellingPendingBillPaymentId,
    closeRefundModal,
    openRefundModal,
    handleRefundAmountDraftChange,
    submitRefund,
    cancelPendingBillPayment,
    createBillTeam,
    createBillError,
    creatingBill,
    createBillOwnerType,
    createBillOwnerId,
    createBillAmountDollars,
    createBillTaxDollars,
    createBillAllowSplit,
    createBillLabel,
    createBillUserOptions,
    createBillIsUserOnly,
    createBillPreviewLineItems,
    createBillTotalCents,
    closeCreateBillModal,
    openCreateBillModal,
    setCreateBillOwnerType,
    setCreateBillOwnerId,
    setCreateBillAmountDollars,
    setCreateBillTaxDollars,
    setCreateBillAllowSplit,
    setCreateBillLabel,
    submitCreateBill,
  };
}
