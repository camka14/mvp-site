'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  Group,
  Loader,
  Modal,
  Paper,
  PasswordInput,
  Select as MantineSelect,
  Stack,
  Text,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useApp } from '@/app/providers';
import { apiRequest, isApiRequestError } from '@/lib/apiClient';
import { boldsignService, type SignStep } from '@/lib/boldsignService';
import BillingAddressModal from '@/components/ui/BillingAddressModal';
import { familyService, type FamilyChild } from '@/lib/familyService';
import { createId } from '@/lib/id';
import { paymentService } from '@/lib/paymentService';
import PaymentModal, { type PaymentEventSummary } from '@/components/ui/PaymentModal';
import { signedDocumentService } from '@/lib/signedDocumentService';
import {
  teamService,
  type TeamRegistrationCheckoutTarget,
  type TeamRegistrationResult,
} from '@/lib/teamService';
import type { BillingAddress, PaymentIntent, Team, TeamPlayerRegistration, UserData } from '@/types';
import { formatPrice } from '@/types';

const TEAM_JOIN_TIMEOUT_MS = 5_000;
const ACTIVE_CHILD_LINK_STATUS = 'active';
const TEAM_SIGN_MODAL_Z_INDEX = 2200;

type TeamRegistrationIntent = {
  mode: 'self' | 'child';
  childId?: string;
  childEmail?: string | null;
  reviewOnly?: boolean;
};

export type TeamRegistrationFlowRenderState = {
  team: Team;
  teamHasCapacity: boolean;
  actionLabel: string;
  actionDisabled: boolean;
  actionLoading: boolean;
  actionVisible: boolean;
  registrationError: string | null;
  currentUserActiveMember: boolean;
  currentUserPendingRegistration: boolean;
  shouldOfferDocumentReview: boolean;
  hasActiveChildren: boolean;
  openFlow: () => void;
  refreshTeam: () => Promise<Team | undefined>;
};

type TeamRegistrationFlowProps = {
  team: Team;
  user?: UserData | null;
  paymentSummary: PaymentEventSummary;
  organization?: { $id?: string; name?: string } | null;
  onRequireAuth?: () => void;
  onTeamUpdated?: (team: Team) => void;
  onCompleted?: (team: Team) => void | Promise<void>;
  onErrorChange?: (message: string | null) => void;
  children: (state: TeamRegistrationFlowRenderState) => React.ReactNode;
};

const normalizeText = (value: unknown): string => (
  typeof value === 'string' ? value.trim() : ''
);

const normalizeEmail = (value: unknown): string | null => {
  const normalized = normalizeText(value).toLowerCase();
  return normalized.length > 0 ? normalized : null;
};

const dedupeSignSteps = (
  steps: SignStep[],
  fallbackSignerContext: 'participant' | 'parent_guardian' | 'child',
): SignStep[] => {
  const seen = new Set<string>();
  return steps.filter((step) => {
    const key = `${step.signerContext ?? fallbackSignerContext}:${step.templateId}:${step.documentId ?? ''}:${step.type}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

const isConsentIncomplete = (consentStatus?: string | null): boolean => {
  const normalized = normalizeText(consentStatus).toLowerCase();
  if (!normalized.length) {
    return false;
  }
  return normalized !== 'completed';
};

const isChildIntent = (intent: TeamRegistrationIntent): boolean => intent.mode === 'child';

const buildCheckoutTarget = (
  teamId: string,
  result: TeamRegistrationResult | null,
  fallbackRegistration?: TeamPlayerRegistration,
): TeamRegistrationCheckoutTarget => {
  const registration = result?.registration ?? fallbackRegistration ?? null;
  return {
    id: normalizeText(result?.registrationId) || normalizeText(registration?.id) || undefined,
    teamId,
    registrantId: normalizeText(registration?.registrantId ?? registration?.userId) || undefined,
    userId: normalizeText(registration?.userId) || undefined,
    parentId: normalizeText(registration?.parentId) || null,
    registrantType: normalizeText(registration?.registrantType) || 'SELF',
    rosterRole: normalizeText(registration?.rosterRole) || 'PARTICIPANT',
    consentDocumentId: normalizeText(
      result?.consent?.documentId ?? registration?.consentDocumentId,
    ) || null,
    consentStatus: normalizeText(
      result?.consent?.status ?? registration?.consentStatus,
    ) || null,
  };
};

export default function TeamRegistrationFlow({
  team,
  user,
  paymentSummary,
  organization,
  onRequireAuth,
  onTeamUpdated,
  onCompleted,
  onErrorChange,
  children,
}: TeamRegistrationFlowProps) {
  const { authUser } = useApp();
  const [resolvedTeam, setResolvedTeam] = useState<Team>(team);
  const [registrationError, setRegistrationError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [paymentData, setPaymentData] = useState<PaymentIntent | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showBillingAddressModal, setShowBillingAddressModal] = useState(false);
  const [pendingBillingIntent, setPendingBillingIntent] = useState<TeamRegistrationIntent | null>(null);
  const [pendingCheckoutTarget, setPendingCheckoutTarget] = useState<TeamRegistrationCheckoutTarget | null>(null);
  const [showJoinChoiceModal, setShowJoinChoiceModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmingPassword, setConfirmingPassword] = useState(false);
  const [showSignModal, setShowSignModal] = useState(false);
  const [signLinks, setSignLinks] = useState<SignStep[]>([]);
  const [currentSignIndex, setCurrentSignIndex] = useState(0);
  const [pendingIntent, setPendingIntent] = useState<TeamRegistrationIntent | null>(null);
  const [pendingSignedDocumentId, setPendingSignedDocumentId] = useState<string | null>(null);
  const [pendingSignatureOperationId, setPendingSignatureOperationId] = useState<string | null>(null);
  const [recordingSignature, setRecordingSignature] = useState(false);
  const [textAccepted, setTextAccepted] = useState(false);
  const [childrenData, setChildrenData] = useState<FamilyChild[]>([]);
  const [childrenLoading, setChildrenLoading] = useState(false);
  const [childrenError, setChildrenError] = useState<string | null>(null);
  const [selectedChildId, setSelectedChildId] = useState('');

  useEffect(() => {
    setResolvedTeam(team);
  }, [team]);

  useEffect(() => {
    onErrorChange?.(registrationError);
  }, [onErrorChange, registrationError]);

  useEffect(() => {
    if (!user?.$id) {
      setChildrenData([]);
      setChildrenLoading(false);
      setChildrenError(null);
      setSelectedChildId('');
      return;
    }

    let cancelled = false;
    const loadChildren = async () => {
      setChildrenLoading(true);
      setChildrenError(null);
      try {
        const rows = await familyService.listChildren();
        if (cancelled) {
          return;
        }
        setChildrenData(rows);
        const activeChildren = rows.filter((child) => normalizeText(child.linkStatus).toLowerCase() === ACTIVE_CHILD_LINK_STATUS);
        setSelectedChildId((current) => (
          current && activeChildren.some((child) => child.userId === current)
            ? current
            : (activeChildren[0]?.userId ?? '')
        ));
      } catch (error) {
        if (cancelled) {
          return;
        }
        setChildrenData([]);
        setChildrenError(error instanceof Error ? error.message : 'Failed to load linked children.');
      } finally {
        if (!cancelled) {
          setChildrenLoading(false);
        }
      }
    };

    void loadChildren();
    return () => {
      cancelled = true;
    };
  }, [user?.$id]);

  const refreshTeam = useCallback(async (): Promise<Team | undefined> => {
    const refreshed = await teamService.getTeamById(resolvedTeam.$id, false);
    if (refreshed) {
      setResolvedTeam(refreshed);
      onTeamUpdated?.(refreshed);
      return refreshed;
    }
    return undefined;
  }, [onTeamUpdated, resolvedTeam.$id]);

  const registrations = Array.isArray(resolvedTeam.playerRegistrations)
    ? resolvedTeam.playerRegistrations
    : [];
  const currentUserRegistration = useMemo(() => {
    if (!user?.$id) {
      return null;
    }
    return registrations.find((registration) => registration.userId === user.$id) ?? null;
  }, [registrations, user?.$id]);
  const currentUserRegistrationStatus = normalizeText(currentUserRegistration?.status).toUpperCase();
  const currentUserActiveMember = currentUserRegistrationStatus === 'ACTIVE' || resolvedTeam.playerIds.includes(user?.$id ?? '');
  const currentUserPendingRegistration = currentUserRegistrationStatus === 'STARTED';
  const reservedOrActiveRegistrationCount = useMemo(() => (
    Math.max(
      registrations.filter((registration) => {
        const status = normalizeText(registration.status).toUpperCase();
        return status === 'ACTIVE' || status === 'INVITED' || status === 'STARTED';
      }).length,
      new Set([...resolvedTeam.playerIds, ...resolvedTeam.pending]).size,
    )
  ), [registrations, resolvedTeam.pending, resolvedTeam.playerIds]);
  const teamHasCapacity = !resolvedTeam.teamSize || reservedOrActiveRegistrationCount < resolvedTeam.teamSize;
  const requiredTemplateIds = Array.isArray(resolvedTeam.requiredTemplateIds)
    ? resolvedTeam.requiredTemplateIds.filter((value) => normalizeText(value).length > 0)
    : [];
  const shouldOfferDocumentReview = currentUserActiveMember && requiredTemplateIds.length > 0;
  const registrationPriceCents = Math.max(0, Math.round(resolvedTeam.registrationPriceCents ?? 0));
  const activeChildren = useMemo(() => (
    childrenData.filter((child) => normalizeText(child.linkStatus).toLowerCase() === ACTIVE_CHILD_LINK_STATUS)
  ), [childrenData]);
  const hasActiveChildren = activeChildren.length > 0;
  const selectedChild = activeChildren.find((child) => child.userId === selectedChildId) ?? null;

  const actionVisible = currentUserPendingRegistration || shouldOfferDocumentReview || Boolean(resolvedTeam.openRegistration);
  const actionDisabled = actionLoading
    || (!currentUserPendingRegistration && !shouldOfferDocumentReview && (!resolvedTeam.openRegistration || (!teamHasCapacity && !hasActiveChildren)));
  const actionLabel = (() => {
    if (currentUserPendingRegistration) {
      return isConsentIncomplete(currentUserRegistration?.consentStatus)
        ? 'Complete Documents'
        : registrationPriceCents > 0
          ? 'Resume Payment'
          : 'Finish Joining';
    }
    if (shouldOfferDocumentReview) {
      return 'Review Documents';
    }
    return registrationPriceCents > 0
      ? `Join for ${formatPrice(registrationPriceCents)}`
      : 'Join Team';
  })();

  const notifyWarnings = useCallback((warnings?: string[]) => {
    const message = Array.isArray(warnings)
      ? warnings.map((warning) => normalizeText(warning)).filter(Boolean).join(' ')
      : '';
    if (message.length > 0) {
      notifications.show({
        color: 'yellow',
        message,
      });
    }
  }, []);

  const loadRequiredSignLinksForIntent = useCallback(async (intent: TeamRegistrationIntent): Promise<SignStep[]> => {
    if (!user || !authUser?.email) {
      throw new Error('Sign-in email is required to sign team documents.');
    }

    const signerContext: 'participant' | 'parent_guardian' = isChildIntent(intent)
      ? 'parent_guardian'
      : 'participant';
    const parentLinks = await boldsignService.createSignLinks({
      teamId: resolvedTeam.$id,
      user,
      userEmail: authUser.email,
      signerContext,
      childUserId: intent.childId,
      childEmail: intent.childEmail ?? undefined,
      timeoutMs: TEAM_JOIN_TIMEOUT_MS,
    });

    const shouldCollectChildSignatureInSameSession = isChildIntent(intent) && Boolean(
      intent.childId
      && normalizeEmail(authUser.email)
      && normalizeEmail(intent.childEmail)
      && normalizeEmail(authUser.email) === normalizeEmail(intent.childEmail),
    );
    if (!shouldCollectChildSignatureInSameSession || !intent.childId) {
      return dedupeSignSteps(parentLinks, signerContext);
    }

    const childLinks = await boldsignService.createSignLinks({
      teamId: resolvedTeam.$id,
      user,
      userEmail: authUser.email,
      signerContext: 'child',
      childUserId: intent.childId,
      childEmail: intent.childEmail ?? undefined,
      timeoutMs: TEAM_JOIN_TIMEOUT_MS,
    });
    return dedupeSignSteps([...parentLinks, ...childLinks], signerContext);
  }, [authUser?.email, resolvedTeam.$id, user]);

  const beginSigningFlow = useCallback(async (intent: TeamRegistrationIntent): Promise<boolean> => {
    if (!requiredTemplateIds.length) {
      return false;
    }
    const links = await loadRequiredSignLinksForIntent(intent);
    if (!links.length) {
      return false;
    }
    setPendingIntent(intent);
    setSignLinks(links);
    setCurrentSignIndex(0);
    setPendingSignedDocumentId(null);
    setPendingSignatureOperationId(null);
    setPassword('');
    setPasswordError(null);
    setShowPasswordModal(true);
    return true;
  }, [loadRequiredSignLinksForIntent, requiredTemplateIds.length]);

  const startCheckout = useCallback(async (
    checkoutTarget: TeamRegistrationCheckoutTarget,
    billingAddress?: BillingAddress,
  ) => {
    if (!user) {
      throw new Error('You must be signed in to continue.');
    }

    try {
      const paymentIntent = await paymentService.createTeamRegistrationPaymentIntent(
        user,
        resolvedTeam,
        checkoutTarget,
        organization ?? undefined,
        billingAddress,
      );
      setPaymentData(paymentIntent);
      setShowPaymentModal(true);
      setShowBillingAddressModal(false);
      setPendingBillingIntent(null);
      setPendingCheckoutTarget(null);
    } catch (error) {
      if (
        isApiRequestError(error)
        && error.data
        && typeof error.data === 'object'
        && 'billingAddressRequired' in error.data
        && Boolean((error.data as { billingAddressRequired?: boolean }).billingAddressRequired)
      ) {
        setPendingCheckoutTarget(checkoutTarget);
        setShowBillingAddressModal(true);
        return;
      }
      throw error;
    }
  }, [organization, resolvedTeam, user]);

  const handleSuccessfulJoin = useCallback(async (successTeam?: Team | null) => {
    const refreshed = successTeam ?? await refreshTeam();
    if (refreshed) {
      notifications.show({
        color: 'green',
        message: `You are registered for ${refreshed.name}.`,
      });
      await onCompleted?.(refreshed);
      return;
    }
    notifications.show({
      color: 'green',
      message: `You are registered for ${resolvedTeam.name}.`,
    });
  }, [onCompleted, refreshTeam, resolvedTeam.name]);

  const continueIntent = useCallback(async (
    intent: TeamRegistrationIntent,
    billingAddress?: BillingAddress,
  ) => {
    if (!user) {
      onRequireAuth?.();
      return;
    }

    const isReviewOnly = Boolean(intent.reviewOnly);
    if (isReviewOnly) {
      const signingStarted = await beginSigningFlow(intent);
      if (!signingStarted) {
        notifications.show({
          color: 'green',
          message: 'All required team documents are already signed.',
        });
        await refreshTeam();
      }
      return;
    }

    const result = intent.mode === 'child'
      ? await teamService.registerChildForTeam(resolvedTeam.$id, intent.childId ?? '')
      : await teamService.registerSelfForTeam(resolvedTeam.$id);

    notifyWarnings(result.warnings);

    const nextTeam = result.team ?? await refreshTeam();
    if (nextTeam) {
      setResolvedTeam(nextTeam);
      onTeamUpdated?.(nextTeam);
    }

    if (result.consent?.requiresChildEmail) {
      throw new Error('Child email is required before team documents can be signed.');
    }

    if (isConsentIncomplete(result.consent?.status)) {
      const signingStarted = await beginSigningFlow({
        ...intent,
        childEmail: result.consent?.childEmail ?? intent.childEmail ?? null,
      });
      if (!signingStarted) {
        throw new Error('Required team documents must be signed before joining.');
      }
      return;
    }

    if (registrationPriceCents > 0) {
      const checkoutTarget = buildCheckoutTarget(
        resolvedTeam.$id,
        result,
        currentUserRegistration ?? undefined,
      );
      setPendingBillingIntent(intent);
      await startCheckout(checkoutTarget, billingAddress);
      return;
    }

    await handleSuccessfulJoin(nextTeam ?? result.team ?? null);
  }, [
    beginSigningFlow,
    currentUserRegistration,
    handleSuccessfulJoin,
    notifyWarnings,
    onRequireAuth,
    onTeamUpdated,
    refreshTeam,
    registrationPriceCents,
    resolvedTeam.$id,
    startCheckout,
    user,
  ]);

  const handleStartFlow = useCallback(async (intent?: TeamRegistrationIntent) => {
    if (!user) {
      onRequireAuth?.();
      return;
    }

    setActionLoading(true);
    setRegistrationError(null);
    try {
      const latestTeam = await refreshTeam();
      if (latestTeam) {
        setResolvedTeam(latestTeam);
      }

      if (intent) {
        await continueIntent(intent);
        return;
      }

      if (shouldOfferDocumentReview) {
        await continueIntent({ mode: 'self', reviewOnly: true });
        return;
      }

      if (!resolvedTeam.openRegistration && !currentUserPendingRegistration) {
        throw new Error('Registration is not open for this team.');
      }
      if (!teamHasCapacity && !currentUserPendingRegistration) {
        throw new Error('This team is full.');
      }
      if (hasActiveChildren && !currentUserPendingRegistration) {
        setShowJoinChoiceModal(true);
        return;
      }
      await continueIntent({ mode: 'self' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to start team registration.';
      setRegistrationError(message);
    } finally {
      setActionLoading(false);
    }
  }, [
    continueIntent,
    currentUserPendingRegistration,
    hasActiveChildren,
    onRequireAuth,
    refreshTeam,
    resolvedTeam.openRegistration,
    shouldOfferDocumentReview,
    teamHasCapacity,
    user,
  ]);

  const confirmPasswordAndStartSigning = useCallback(async () => {
    if (!pendingIntent || !authUser?.email) {
      return;
    }
    if (!password.trim()) {
      setPasswordError('Password is required.');
      return;
    }

    setConfirmingPassword(true);
    setPasswordError(null);
    try {
      await apiRequest<{ ok: true }>('/api/documents/confirm-password', {
        method: 'POST',
        timeoutMs: TEAM_JOIN_TIMEOUT_MS,
        body: {
          email: authUser.email,
          password,
          teamId: resolvedTeam.$id,
        },
      });
      const links = signLinks.length ? signLinks : await loadRequiredSignLinksForIntent(pendingIntent);
      if (!links.length) {
        setShowPasswordModal(false);
        setPassword('');
        const intent = pendingIntent;
        setPendingIntent(null);
        await continueIntent(intent);
        return;
      }

      setSignLinks(links);
      setCurrentSignIndex(0);
      setPendingSignedDocumentId(null);
      setPendingSignatureOperationId(null);
      setShowPasswordModal(false);
      setPassword('');
      setShowSignModal(true);
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : 'Failed to confirm password.');
    } finally {
      setConfirmingPassword(false);
    }
  }, [
    authUser?.email,
    continueIntent,
    loadRequiredSignLinksForIntent,
    password,
    pendingIntent,
    resolvedTeam.$id,
    signLinks,
  ]);

  const recordSignature = useCallback(async (payload: {
    templateId: string;
    documentId: string;
    type: SignStep['type'];
    signerContext?: SignStep['signerContext'];
  }): Promise<{ operationId?: string; syncStatus?: string }> => {
    if (!user) {
      throw new Error('You must be signed in to sign team documents.');
    }

    const fallbackSignerContext = isChildIntent(pendingIntent ?? { mode: 'self' })
      ? 'parent_guardian'
      : 'participant';
    const signerContext = payload.signerContext ?? fallbackSignerContext;
    const signingUserId = signerContext === 'child' && pendingIntent?.childId
      ? pendingIntent.childId
      : user.$id;
    const response = await fetch('/api/documents/record-signature', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        templateId: payload.templateId,
        documentId: payload.documentId,
        teamId: resolvedTeam.$id,
        type: payload.type,
        userId: signingUserId,
        childUserId: pendingIntent?.childId,
        signerContext,
        user,
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result?.error) {
      throw new Error(result?.error || 'Failed to record signature.');
    }
    return {
      operationId: typeof result?.operationId === 'string' ? result.operationId : undefined,
      syncStatus: typeof result?.syncStatus === 'string' ? result.syncStatus : undefined,
    };
  }, [pendingIntent, resolvedTeam.$id, user]);

  const handleSignedDocument = useCallback(async (messageDocumentId?: string) => {
    const currentLink = signLinks[currentSignIndex];
    if (!currentLink || currentLink.type === 'TEXT') {
      return;
    }
    if (messageDocumentId && messageDocumentId !== currentLink.documentId) {
      return;
    }
    if (pendingSignedDocumentId || pendingSignatureOperationId || recordingSignature) {
      return;
    }
    if (!currentLink.documentId) {
      setRegistrationError('Missing document identifier for signature.');
      return;
    }

    setRecordingSignature(true);
    try {
      const signatureResult = await recordSignature({
        templateId: currentLink.templateId,
        documentId: currentLink.documentId,
        type: currentLink.type,
        signerContext: currentLink.signerContext,
      });
      setShowSignModal(false);
      setPendingSignedDocumentId(currentLink.documentId);
      setPendingSignatureOperationId(signatureResult.operationId || currentLink.operationId || null);
    } catch (error) {
      setRegistrationError(error instanceof Error ? error.message : 'Failed to record signature.');
      setShowSignModal(false);
      setSignLinks([]);
      setCurrentSignIndex(0);
      setPendingIntent(null);
    } finally {
      setRecordingSignature(false);
    }
  }, [
    currentSignIndex,
    pendingSignatureOperationId,
    pendingSignedDocumentId,
    recordSignature,
    recordingSignature,
    signLinks,
  ]);

  const handleTextAcceptance = useCallback(async () => {
    const currentLink = signLinks[currentSignIndex];
    if (!currentLink || currentLink.type !== 'TEXT') {
      return;
    }
    if (!textAccepted || pendingSignedDocumentId || pendingSignatureOperationId || recordingSignature) {
      return;
    }

    const documentId = currentLink.documentId || createId();
    setRecordingSignature(true);
    try {
      const signatureResult = await recordSignature({
        templateId: currentLink.templateId,
        documentId,
        type: currentLink.type,
        signerContext: currentLink.signerContext,
      });
      setShowSignModal(false);
      setPendingSignedDocumentId(documentId);
      setPendingSignatureOperationId(signatureResult.operationId || currentLink.operationId || null);
    } catch (error) {
      setRegistrationError(error instanceof Error ? error.message : 'Failed to record signature.');
      setShowSignModal(false);
      setSignLinks([]);
      setCurrentSignIndex(0);
      setPendingIntent(null);
    } finally {
      setRecordingSignature(false);
    }
  }, [
    currentSignIndex,
    pendingSignatureOperationId,
    pendingSignedDocumentId,
    recordSignature,
    recordingSignature,
    signLinks,
    textAccepted,
  ]);

  useEffect(() => {
    setTextAccepted(false);
  }, [currentSignIndex, signLinks]);

  useEffect(() => {
    if (!showSignModal) {
      return;
    }

    const handleMessage = (event: MessageEvent) => {
      if (typeof event.origin === 'string' && !event.origin.includes('boldsign')) {
        return;
      }
      const payload = event.data;
      let eventName = '';
      if (typeof payload === 'string') {
        eventName = payload;
      } else if (payload && typeof payload === 'object') {
        eventName = payload.event || payload.eventName || payload.type || payload.name || '';
      }
      const eventLabel = eventName.toString();
      if (!eventLabel || (!eventLabel.includes('onDocumentSigned') && !eventLabel.includes('documentSigned'))) {
        return;
      }

      const documentId = (payload && typeof payload === 'object' && (payload.documentId || payload.documentID)) || undefined;
      void handleSignedDocument(typeof documentId === 'string' ? documentId : undefined);
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [handleSignedDocument, showSignModal]);

  const completeAfterSignatures = useCallback(async (intent: TeamRegistrationIntent) => {
    const nextIndex = currentSignIndex + 1;
    if (nextIndex < signLinks.length) {
      setCurrentSignIndex(nextIndex);
      setPendingSignedDocumentId(null);
      setPendingSignatureOperationId(null);
      setShowSignModal(true);
      return;
    }

    setPendingSignedDocumentId(null);
    setPendingSignatureOperationId(null);
    setSignLinks([]);
    setCurrentSignIndex(0);
    setShowSignModal(false);
    setPendingIntent(null);

    if (intent.reviewOnly) {
      await refreshTeam();
      notifications.show({
        color: 'green',
        message: 'Team documents are up to date.',
      });
      return;
    }

    await continueIntent(intent);
  }, [continueIntent, currentSignIndex, refreshTeam, signLinks.length]);

  useEffect(() => {
    if (!pendingSignatureOperationId || !pendingIntent) {
      return;
    }

    let cancelled = false;
    const startedAt = Date.now();
    const intervalMs = 1_500;
    const timeoutMs = 90_000;

    const poll = async () => {
      try {
        const operation = await boldsignService.getOperationStatus(pendingSignatureOperationId);
        if (cancelled) {
          return;
        }

        const status = normalizeText(operation.status).toUpperCase();
        if (status === 'CONFIRMED') {
          await completeAfterSignatures(pendingIntent);
          return;
        }
        if (status === 'FAILED' || status === 'FAILED_RETRYABLE' || status === 'TIMED_OUT') {
          throw new Error(operation.error || 'Failed to synchronize signature status.');
        }
        if (Date.now() - startedAt > timeoutMs) {
          throw new Error('Signature sync is delayed. Please try again shortly.');
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        setRegistrationError(error instanceof Error ? error.message : 'Failed to confirm signature.');
        setPendingSignedDocumentId(null);
        setPendingSignatureOperationId(null);
        setShowSignModal(false);
        setSignLinks([]);
        setCurrentSignIndex(0);
        setPendingIntent(null);
      }
    };

    const interval = window.setInterval(() => {
      void poll();
    }, intervalMs);
    void poll();
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [completeAfterSignatures, pendingIntent, pendingSignatureOperationId]);

  useEffect(() => {
    if (!pendingSignedDocumentId || pendingSignatureOperationId || !pendingIntent || !user) {
      return;
    }

    let cancelled = false;
    const poll = async () => {
      try {
        const currentLink = signLinks[currentSignIndex];
        const pendingSignerUserId = currentLink?.signerContext === 'child' && pendingIntent.childId
          ? pendingIntent.childId
          : user.$id;
        const signed = await signedDocumentService.isDocumentSigned(pendingSignedDocumentId, pendingSignerUserId);
        if (!signed || cancelled) {
          return;
        }
        await completeAfterSignatures(pendingIntent);
      } catch (error) {
        if (cancelled) {
          return;
        }
        setRegistrationError(error instanceof Error ? error.message : 'Failed to confirm signature.');
        setPendingSignedDocumentId(null);
        setShowSignModal(false);
        setSignLinks([]);
        setCurrentSignIndex(0);
        setPendingIntent(null);
      }
    };

    const interval = window.setInterval(() => {
      void poll();
    }, 1_000);
    void poll();
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [
    completeAfterSignatures,
    currentSignIndex,
    pendingIntent,
    pendingSignatureOperationId,
    pendingSignedDocumentId,
    signLinks,
    user,
  ]);

  const renderState: TeamRegistrationFlowRenderState = {
    team: resolvedTeam,
    teamHasCapacity,
    actionLabel,
    actionDisabled,
    actionLoading,
    actionVisible,
    registrationError,
    currentUserActiveMember,
    currentUserPendingRegistration,
    shouldOfferDocumentReview,
    hasActiveChildren,
    openFlow: () => {
      void handleStartFlow();
    },
    refreshTeam,
  };

  return (
    <>
      {children(renderState)}

      <Modal
        opened={showJoinChoiceModal}
        onClose={() => setShowJoinChoiceModal(false)}
        centered
        title="Join for yourself or child?"
        zIndex={TEAM_SIGN_MODAL_Z_INDEX}
      >
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            Choose whether to join this team yourself or register a linked child instead.
          </Text>
          {childrenError ? (
            <Alert color="red" variant="light">
              {childrenError}
            </Alert>
          ) : null}
          {childrenLoading ? (
            <Group gap="sm">
              <Loader size="sm" />
              <Text size="sm" c="dimmed">Loading linked children...</Text>
            </Group>
          ) : null}
          {!childrenLoading && activeChildren.length > 0 ? (
            <MantineSelect
              label="Child"
              data={activeChildren.map((child) => ({
                value: child.userId,
                label: `${normalizeText(child.firstName)} ${normalizeText(child.lastName)}`.trim() || child.userId,
              }))}
              value={selectedChildId || null}
              onChange={(value) => setSelectedChildId(value || '')}
              allowDeselect={false}
            />
          ) : null}
          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={() => {
                setShowJoinChoiceModal(false);
                void handleStartFlow({ mode: 'self' });
              }}
            >
              Join Myself
            </Button>
            <Button
              onClick={() => {
                if (!selectedChild) {
                  setRegistrationError('Select a child to continue.');
                  return;
                }
                setShowJoinChoiceModal(false);
                void handleStartFlow({
                  mode: 'child',
                  childId: selectedChild.userId,
                  childEmail: selectedChild.email ?? null,
                });
              }}
              disabled={!selectedChild}
            >
              Join as Child
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={showPasswordModal}
        onClose={() => {
          setShowPasswordModal(false);
          setPassword('');
          setPasswordError(null);
          setPendingIntent(null);
        }}
        centered
        title="Confirm your password"
        zIndex={TEAM_SIGN_MODAL_Z_INDEX}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void confirmPasswordAndStartSigning();
          }}
        >
          <Stack gap="sm">
            <Text size="sm" c="dimmed">
              Please confirm your password before signing required team documents.
            </Text>
            <PasswordInput
              label="Password"
              value={password}
              onChange={(event) => setPassword(event.currentTarget.value)}
              error={passwordError ?? undefined}
              required
            />
            <Group justify="flex-end">
              <Button
                variant="default"
                onClick={() => {
                  setShowPasswordModal(false);
                  setPassword('');
                  setPasswordError(null);
                  setPendingIntent(null);
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                loading={confirmingPassword}
                disabled={!password.trim()}
              >
                Continue
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <Modal
        opened={showSignModal}
        onClose={() => {
          setShowSignModal(false);
          setSignLinks([]);
          setCurrentSignIndex(0);
          setPendingIntent(null);
        }}
        centered
        size="xl"
        title="Sign required documents"
        zIndex={TEAM_SIGN_MODAL_Z_INDEX}
      >
        {signLinks.length > 0 ? (
          <div>
            <Text size="sm" c="dimmed" mb="xs">
              Document {currentSignIndex + 1} of {signLinks.length}
              {signLinks[currentSignIndex]?.title ? ` • ${signLinks[currentSignIndex]?.title}` : ''}
            </Text>
            {signLinks[currentSignIndex]?.requiredSignerLabel ? (
              <Text size="xs" c="dimmed" mb="xs">
                Required signer: {signLinks[currentSignIndex]?.requiredSignerLabel}
              </Text>
            ) : null}
            {signLinks[currentSignIndex]?.type === 'TEXT' ? (
              <Stack gap="sm">
                <Paper withBorder p="md" style={{ maxHeight: 420, overflowY: 'auto' }}>
                  <Text style={{ whiteSpace: 'pre-wrap' }}>
                    {signLinks[currentSignIndex]?.content || 'No waiver text provided.'}
                  </Text>
                </Paper>
                <Checkbox
                  label="I agree to the waiver above."
                  checked={textAccepted}
                  onChange={(event) => setTextAccepted(event.currentTarget.checked)}
                />
                <Group justify="flex-end">
                  <Button
                    onClick={() => { void handleTextAcceptance(); }}
                    loading={recordingSignature}
                    disabled={!textAccepted || recordingSignature}
                  >
                    Accept and continue
                  </Button>
                </Group>
              </Stack>
            ) : (
              <Stack gap="xs">
                <div style={{ height: 600 }}>
                  <iframe
                    src={signLinks[currentSignIndex]?.url}
                    title="BoldSign Signing"
                    style={{ width: '100%', height: '100%', border: 'none' }}
                  />
                </div>
                <Group justify="flex-end">
                  <Button
                    variant="default"
                    onClick={() => { void handleSignedDocument(); }}
                    loading={recordingSignature}
                    disabled={recordingSignature}
                  >
                    I finished signing
                  </Button>
                </Group>
              </Stack>
            )}
          </div>
        ) : (
          <Text size="sm" c="dimmed">Preparing documents...</Text>
        )}
      </Modal>

      <BillingAddressModal
        opened={showBillingAddressModal}
        onClose={() => {
          setShowBillingAddressModal(false);
          setPendingBillingIntent(null);
          setPendingCheckoutTarget(null);
        }}
        onSaved={async (billingAddress) => {
          try {
            if (pendingCheckoutTarget) {
              await startCheckout(pendingCheckoutTarget, billingAddress);
              return;
            }
            if (pendingBillingIntent) {
              await continueIntent(pendingBillingIntent, billingAddress);
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Unable to continue checkout.';
            setRegistrationError(message);
          }
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
        event={paymentSummary}
        paymentData={paymentData}
        onPaymentSuccess={async () => {
          setShowPaymentModal(false);
          setPaymentData(null);
          const refreshed = await refreshTeam();
          if (refreshed) {
            await handleSuccessfulJoin(refreshed);
          } else {
            notifications.show({
              color: 'green',
              message: `Payment completed for ${resolvedTeam.name}.`,
            });
          }
        }}
      />
    </>
  );
}
