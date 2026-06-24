'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  Collapse,
  Group,
  Loader,
  Modal,
  Paper,
  PasswordInput,
  Select as MantineSelect,
  Stack,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useApp } from '@/app/providers';
import { apiRequest, isApiRequestError } from '@/lib/apiClient';
import { boldsignService, type SignStep } from '@/lib/boldsignService';
import BillingAddressModal from '@/components/ui/BillingAddressModal';
import RegistrationHoldTimer from '@/components/ui/RegistrationHoldTimer';
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
import type {
  BillingAddress,
  PaymentIntent,
  RegistrationQuestion,
  RegistrationQuestionAnswerInput,
  Team,
  TeamJoinRequest,
  TeamPlayerRegistration,
  UserData,
} from '@/types';
import { formatPrice } from '@/types';
import {
  buildRegistrationProgressKey,
  clearRegistrationProgress,
  loadRegistrationProgress,
  saveRegistrationProgress,
  type RegistrationProgressStep,
} from '@/lib/registrationProgressStorage';

const TEAM_JOIN_TIMEOUT_MS = 5_000;
const ACTIVE_CHILD_LINK_STATUS = 'active';
const TEAM_SIGN_MODAL_Z_INDEX = 2200;

type TeamRegistrationIntent = {
  mode: 'self' | 'child';
  childId?: string;
  childEmail?: string | null;
  reviewOnly?: boolean;
  answers?: RegistrationQuestionAnswerInput[];
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
  currentUserPaymentPending: boolean;
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
  const [registrationHoldExpiresAt, setRegistrationHoldExpiresAt] = useState<string | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showBillingAddressModal, setShowBillingAddressModal] = useState(false);
  const [showDiscountCodeModal, setShowDiscountCodeModal] = useState(false);
  const [discountCode, setDiscountCode] = useState('');
  const [pendingBillingIntent, setPendingBillingIntent] = useState<TeamRegistrationIntent | null>(null);
  const [pendingCheckoutTarget, setPendingCheckoutTarget] = useState<TeamRegistrationCheckoutTarget | null>(null);
  const [showJoinChoiceModal, setShowJoinChoiceModal] = useState(false);
  const [showQuestionsModal, setShowQuestionsModal] = useState(false);
  const [questionsIntent, setQuestionsIntent] = useState<TeamRegistrationIntent | null>(null);
  const [questionsCollapsed, setQuestionsCollapsed] = useState(false);
  const [registrationQuestions, setRegistrationQuestions] = useState<RegistrationQuestion[]>([]);
  const [questionAnswers, setQuestionAnswers] = useState<Record<string, string>>({});
  const [joinContextLoading, setJoinContextLoading] = useState(false);
  const [joinContextError, setJoinContextError] = useState<string | null>(null);
  const [currentJoinRequest, setCurrentJoinRequest] = useState<TeamJoinRequest | null>(null);
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
  const registrationTeamId = useMemo(
    () => normalizeText(team.parentTeamId) || normalizeText(team.$id),
    [team.$id, team.parentTeamId],
  );
  const resolvedRegistrationTeamId = useMemo(
    () => normalizeText(resolvedTeam.parentTeamId) || normalizeText(resolvedTeam.$id) || registrationTeamId,
    [registrationTeamId, resolvedTeam.$id, resolvedTeam.parentTeamId],
  );
  const paymentRegistrationTeam = useMemo(
    () => (
      resolvedRegistrationTeamId && normalizeText(resolvedTeam.$id) !== resolvedRegistrationTeamId
        ? { ...resolvedTeam, $id: resolvedRegistrationTeamId, parentTeamId: null }
        : resolvedTeam
    ),
    [resolvedRegistrationTeamId, resolvedTeam],
  );
  const teamRegistrationProgressKey = useMemo(() => buildRegistrationProgressKey({
    scope: 'team',
    userId: user?.$id,
    subjectId: resolvedRegistrationTeamId,
  }), [resolvedRegistrationTeamId, user?.$id]);
  const saveTeamRegistrationProgress = useCallback((patch: {
    step?: RegistrationProgressStep;
    answers?: Record<string, string>;
    registrationId?: string | null;
    holdExpiresAt?: string | null;
  } = {}) => {
    if (!teamRegistrationProgressKey || !user?.$id || !resolvedRegistrationTeamId) {
      return;
    }
    saveRegistrationProgress(teamRegistrationProgressKey, {
      scope: 'team',
      userId: user.$id,
      subjectId: resolvedRegistrationTeamId,
      step: patch.step ?? 'questions',
      answers: patch.answers ?? questionAnswers,
      registrationId: patch.registrationId ?? paymentData?.registrationId ?? null,
      holdExpiresAt: patch.holdExpiresAt ?? registrationHoldExpiresAt,
    });
  }, [
    paymentData?.registrationId,
    questionAnswers,
    registrationHoldExpiresAt,
    resolvedRegistrationTeamId,
    teamRegistrationProgressKey,
    user?.$id,
  ]);
  const clearTeamRegistrationProgress = useCallback(() => {
    clearRegistrationProgress(teamRegistrationProgressKey);
    setRegistrationHoldExpiresAt(null);
  }, [teamRegistrationProgressKey]);
  const handleTeamRegistrationHoldExpired = useCallback(() => {
    clearTeamRegistrationProgress();
    setShowPaymentModal(false);
    setPaymentData(null);
    setPendingBillingIntent(null);
    setPendingCheckoutTarget(null);
    setShowBillingAddressModal(false);
    setRegistrationError('Registration hold expired. Start registration again to reserve a new spot.');
  }, [clearTeamRegistrationProgress]);

  useEffect(() => {
    setResolvedTeam(team);
  }, [team]);

  useEffect(() => {
    if (!registrationTeamId || registrationTeamId === normalizeText(team.$id)) {
      return undefined;
    }

    let cancelled = false;
    const loadCanonicalTeam = async () => {
      try {
        const canonicalTeam = await teamService.getTeamById(registrationTeamId, false);
        if (!cancelled && canonicalTeam) {
          setResolvedTeam(canonicalTeam);
        }
      } catch {
        // The explicit refresh path surfaces errors when the user starts registration.
      }
    };

    void loadCanonicalTeam();
    return () => {
      cancelled = true;
    };
  }, [registrationTeamId, team.$id]);

  useEffect(() => {
    if (!registrationTeamId) {
      setRegistrationQuestions([]);
      setCurrentJoinRequest(null);
      setQuestionAnswers({});
      setJoinContextLoading(false);
      setJoinContextError(null);
      return undefined;
    }
    let cancelled = false;
    const loadJoinContext = async () => {
      setJoinContextLoading(true);
      setJoinContextError(null);
      try {
        const context = await teamService.getTeamJoinRequestContext(registrationTeamId);
        if (cancelled) {
          return;
        }
        setRegistrationQuestions(context.questions ?? []);
        setCurrentJoinRequest(context.currentRequest ?? null);
        setQuestionAnswers((current) => {
          const next = { ...current };
          (context.questions ?? []).forEach((question) => {
            if (!(question.id in next)) {
              next[question.id] = '';
            }
          });
          return next;
        });
        setResolvedTeam((current) => ({
          ...current,
          joinPolicy: context.joinPolicy,
          openRegistration: context.openRegistration,
          registrationPriceCents: context.registrationPriceCents,
        }));
      } catch (error) {
        if (!cancelled) {
          setRegistrationQuestions([]);
          setCurrentJoinRequest(null);
          setJoinContextError(error instanceof Error ? error.message : 'Unable to load team registration settings.');
        }
      } finally {
        if (!cancelled) {
          setJoinContextLoading(false);
        }
      }
    };
    void loadJoinContext();
    return () => {
      cancelled = true;
    };
  }, [registrationTeamId, user?.$id]);

  useEffect(() => {
    const draft = loadRegistrationProgress(teamRegistrationProgressKey);
    if (!draft) {
      setRegistrationHoldExpiresAt(null);
      return;
    }
    if (draft.answers) {
      setQuestionAnswers((current) => ({
        ...current,
        ...draft.answers,
      }));
    }
    setRegistrationHoldExpiresAt(draft.holdExpiresAt ?? null);
  }, [teamRegistrationProgressKey]);

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
    if (!registrationTeamId) {
      return undefined;
    }
    const refreshed = await teamService.getTeamById(registrationTeamId, false);
    if (refreshed) {
      setResolvedTeam(refreshed);
      onTeamUpdated?.(refreshed);
      return refreshed;
    }
    return undefined;
  }, [onTeamUpdated, registrationTeamId]);

  const registrations = useMemo(
    () => (Array.isArray(resolvedTeam.playerRegistrations) ? resolvedTeam.playerRegistrations : []),
    [resolvedTeam.playerRegistrations],
  );
  const currentUserRegistration = useMemo(() => {
    if (!user?.$id) {
      return null;
    }
    return registrations.find((registration) => registration.userId === user.$id) ?? null;
  }, [registrations, user?.$id]);
  const currentUserRegistrationStatus = normalizeText(currentUserRegistration?.status).toUpperCase();
  const currentUserPaymentPending = currentUserRegistrationStatus === 'PENDING';
  const currentUserActiveMember = currentUserRegistrationStatus === 'ACTIVE'
    || currentUserPaymentPending
    || resolvedTeam.playerIds.includes(user?.$id ?? '');
  const currentUserPendingRegistration = currentUserRegistrationStatus === 'STARTED';
  const reservedOrActiveRegistrationCount = useMemo(() => (
    Math.max(
      registrations.filter((registration) => {
        const status = normalizeText(registration.status).toUpperCase();
        return status === 'ACTIVE' || status === 'INVITED' || status === 'STARTED' || status === 'PENDING';
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
  const joinPolicy = resolvedTeam.joinPolicy ?? (resolvedTeam.openRegistration ? 'OPEN_REGISTRATION' : 'CLOSED');
  const requestOnly = joinPolicy === 'REQUEST_TO_JOIN';
  const currentJoinRequestPending = normalizeText(currentJoinRequest?.status).toUpperCase() === 'PENDING';
  const activeChildren = useMemo(() => (
    childrenData.filter((child) => normalizeText(child.linkStatus).toLowerCase() === ACTIVE_CHILD_LINK_STATUS)
  ), [childrenData]);
  const hasActiveChildren = activeChildren.length > 0;
  const selectedChild = activeChildren.find((child) => child.userId === selectedChildId) ?? null;

  const actionVisible = currentUserPaymentPending
    || currentUserPendingRegistration
    || shouldOfferDocumentReview
    || Boolean(resolvedTeam.openRegistration)
    || requestOnly
    || currentJoinRequestPending;
  const combinedRegistrationError = registrationError ?? joinContextError;
  const actionDisabled = actionLoading
    || joinContextLoading
    || Boolean(joinContextError)
    || currentUserPaymentPending
    || currentJoinRequestPending
    || (!currentUserPendingRegistration && !shouldOfferDocumentReview && !requestOnly && (!resolvedTeam.openRegistration || (!teamHasCapacity && !hasActiveChildren)))
    || (requestOnly && !teamHasCapacity);
  const actionLabel = (() => {
    if (joinContextLoading) {
      return 'Loading registration...';
    }
    if (currentUserPaymentPending) {
      return 'Payment Pending';
    }
    if (currentJoinRequestPending) {
      return 'Request Pending';
    }
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
    if (requestOnly) {
      return registrationPriceCents > 0
        ? `Request to Join - ${formatPrice(registrationPriceCents)}`
        : 'Request to Join';
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
      teamId: resolvedRegistrationTeamId,
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
      teamId: resolvedRegistrationTeamId,
      user,
      userEmail: authUser.email,
      signerContext: 'child',
      childUserId: intent.childId,
      childEmail: intent.childEmail ?? undefined,
      timeoutMs: TEAM_JOIN_TIMEOUT_MS,
    });
    return dedupeSignSteps([...parentLinks, ...childLinks], signerContext);
  }, [authUser?.email, resolvedRegistrationTeamId, user]);

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
    checkoutDiscountCode?: string | null,
  ) => {
    if (!user) {
      throw new Error('You must be signed in to continue.');
    }

    try {
      const paymentIntent = await paymentService.createTeamRegistrationPaymentIntent(
        user,
        paymentRegistrationTeam,
        checkoutTarget,
        organization ?? undefined,
        billingAddress,
        (checkoutDiscountCode ?? discountCode).trim() || null,
      );
      const holdExpiresAt = paymentIntent.registrationHoldExpiresAt ?? null;
      setRegistrationHoldExpiresAt(holdExpiresAt);
      saveTeamRegistrationProgress({
        step: 'checkout',
        answers: questionAnswers,
        registrationId: paymentIntent.registrationId ?? null,
        holdExpiresAt,
      });
      setPaymentData(paymentIntent);
      setShowPaymentModal(true);
      setShowBillingAddressModal(false);
      setShowDiscountCodeModal(false);
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
  }, [discountCode, organization, paymentRegistrationTeam, questionAnswers, saveTeamRegistrationProgress, user]);

  const handleSuccessfulJoin = useCallback(async (successTeam?: Team | null) => {
    clearTeamRegistrationProgress();
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
  }, [clearTeamRegistrationProgress, onCompleted, refreshTeam, resolvedTeam.name]);

  const buildQuestionAnswerInputs = useCallback((): RegistrationQuestionAnswerInput[] => (
    registrationQuestions.map((question) => ({
      questionId: question.id,
      answer: questionAnswers[question.id] ?? '',
    }))
  ), [questionAnswers, registrationQuestions]);

  const validateQuestionAnswers = useCallback((): string | null => {
    const missingRequired = registrationQuestions.find((question) => (
      Boolean(question.required) && normalizeText(questionAnswers[question.id]).length === 0
    ));
    if (missingRequired) {
      return `Answer "${missingRequired.prompt}" before continuing.`;
    }
    return null;
  }, [questionAnswers, registrationQuestions]);

  const openQuestionsStep = useCallback((intent: TeamRegistrationIntent) => {
    setQuestionsCollapsed(false);
    setQuestionsIntent(intent);
    setShowQuestionsModal(true);
  }, []);

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
      ? await teamService.registerChildForTeam(resolvedRegistrationTeamId, intent.childId ?? '', intent.answers)
      : await teamService.registerSelfForTeam(resolvedRegistrationTeamId, intent.answers);

    notifyWarnings(result.warnings);

    if (result.requiresParentApproval) {
      const nextTeam = result.team ?? await refreshTeam();
      if (nextTeam) {
        setResolvedTeam(nextTeam);
        onTeamUpdated?.(nextTeam);
      }
      notifications.show({
        color: 'blue',
        message: result.message || 'A parent or guardian must accept this team join request before you can be added to the team.',
      });
      return;
    }

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
        resolvedRegistrationTeamId,
        result,
        currentUserRegistration ?? undefined,
      );
      setPendingBillingIntent(intent);
      setPendingCheckoutTarget(checkoutTarget);
      if (billingAddress) {
        await startCheckout(checkoutTarget, billingAddress);
      } else {
        setShowDiscountCodeModal(true);
      }
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
    resolvedRegistrationTeamId,
    startCheckout,
    user,
  ]);

  const submitQuestionsStep = useCallback(async () => {
    if (!questionsIntent) {
      return;
    }
    if (!user) {
      onRequireAuth?.();
      return;
    }

    const validationError = validateQuestionAnswers();
    if (validationError) {
      setQuestionsCollapsed(false);
      setRegistrationError(validationError);
      return;
    }

    const answers = buildQuestionAnswerInputs();
    saveTeamRegistrationProgress({
      step: 'signing',
      answers: questionAnswers,
    });
    setActionLoading(true);
    setRegistrationError(null);
    try {
      setShowQuestionsModal(false);
      if (requestOnly) {
        const submittedRequest = await teamService.requestToJoinTeam(
          resolvedRegistrationTeamId,
          answers,
          questionsIntent.mode === 'child'
            ? {
              registrantUserId: questionsIntent.childId,
              parentId: user.$id,
              registrantType: 'CHILD',
            }
            : { registrantUserId: user.$id, parentId: null, registrantType: 'SELF' },
        );
        setCurrentJoinRequest(submittedRequest);
        notifications.show({
          color: 'green',
          message: 'Your request was sent to the team manager.',
        });
        clearTeamRegistrationProgress();
        await refreshTeam();
        setQuestionsIntent(null);
        return;
      }

      const intentWithAnswers: TeamRegistrationIntent = {
        ...questionsIntent,
        answers,
      };
      setQuestionsIntent(null);
      await continueIntent(intentWithAnswers);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to submit answers.';
      setRegistrationError(message);
      setShowQuestionsModal(true);
    } finally {
      setActionLoading(false);
    }
  }, [
    buildQuestionAnswerInputs,
    continueIntent,
    onRequireAuth,
    questionsIntent,
    refreshTeam,
    requestOnly,
    clearTeamRegistrationProgress,
    questionAnswers,
    resolvedRegistrationTeamId,
    saveTeamRegistrationProgress,
    user,
    validateQuestionAnswers,
  ]);

  const handleStartFlow = useCallback(async (intent?: TeamRegistrationIntent) => {
    if (!user) {
      onRequireAuth?.();
      return;
    }

    setActionLoading(true);
    setRegistrationError(null);
    try {
      if (joinContextLoading) {
        throw new Error('Team registration settings are still loading. Try again in a moment.');
      }
      if (joinContextError) {
        throw new Error(joinContextError);
      }
      const latestTeam = await refreshTeam();
      if (latestTeam) {
        setResolvedTeam(latestTeam);
      }

      if (intent) {
        if (!intent.reviewOnly && !intent.answers && !currentUserPendingRegistration && (requestOnly || registrationQuestions.length > 0)) {
          openQuestionsStep(intent);
          return;
        }
        await continueIntent(intent);
        return;
      }

      if (shouldOfferDocumentReview) {
        await continueIntent({ mode: 'self', reviewOnly: true });
        return;
      }

      if (currentUserPaymentPending) {
        throw new Error('Payment is pending for this team registration.');
      }
      if (currentJoinRequestPending) {
        throw new Error('Your join request is pending manager approval.');
      }
      if (!resolvedTeam.openRegistration && !requestOnly && !currentUserPendingRegistration) {
        throw new Error('Registration is not open for this team.');
      }
      if (!teamHasCapacity && !currentUserPendingRegistration) {
        throw new Error('This team is full.');
      }
      if (hasActiveChildren && !currentUserPendingRegistration) {
        setShowJoinChoiceModal(true);
        return;
      }
      if (!currentUserPendingRegistration && (requestOnly || registrationQuestions.length > 0)) {
        openQuestionsStep({ mode: 'self' });
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
    currentJoinRequestPending,
    currentUserPendingRegistration,
    currentUserPaymentPending,
    hasActiveChildren,
    joinContextError,
    joinContextLoading,
    onRequireAuth,
    openQuestionsStep,
    refreshTeam,
    registrationQuestions.length,
    resolvedTeam.openRegistration,
    requestOnly,
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
          teamId: resolvedRegistrationTeamId,
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
    resolvedRegistrationTeamId,
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
        teamId: resolvedRegistrationTeamId,
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
  }, [pendingIntent, resolvedRegistrationTeamId, user]);

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
    actionLoading: actionLoading || joinContextLoading,
    actionVisible,
    registrationError: combinedRegistrationError,
    currentUserActiveMember,
    currentUserPendingRegistration,
    currentUserPaymentPending,
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
        opened={showQuestionsModal}
        onClose={() => {
          setShowQuestionsModal(false);
          setQuestionsIntent(null);
        }}
        centered
        size="lg"
        title={requestOnly ? 'Request to join' : 'Registration questions'}
        zIndex={TEAM_SIGN_MODAL_Z_INDEX}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submitQuestionsStep();
          }}
        >
          <Stack gap="sm">
            {requestOnly ? (
              <Alert color="blue" variant="light">
                {registrationPriceCents > 0
                  ? `The manager listed this team at ${formatPrice(registrationPriceCents)}. No payment is collected with this request.`
                  : 'No payment is collected with this request.'}
              </Alert>
            ) : null}
            {questionsIntent?.mode === 'child' && selectedChild ? (
              <Text size="sm" c="dimmed">
                Registrant: {`${normalizeText(selectedChild.firstName)} ${normalizeText(selectedChild.lastName)}`.trim() || selectedChild.userId}
              </Text>
            ) : null}
            {registrationQuestions.length > 0 ? (
              <Paper withBorder radius="md" p="sm">
                <Group justify="space-between" mb="xs">
                  <Text size="sm" fw={600}>Registration questions</Text>
                  <Button
                    type="button"
                    size="xs"
                    variant="subtle"
                    aria-expanded={!questionsCollapsed}
                    aria-controls="team-registration-flow-questions"
                    onClick={() => setQuestionsCollapsed((current) => !current)}
                  >
                    {questionsCollapsed ? 'Expand' : 'Collapse'}
                  </Button>
                </Group>
                <Collapse in={!questionsCollapsed}>
                  <Stack id="team-registration-flow-questions" gap="md">
                    {registrationQuestions.map((question) => (
                      <Textarea
                        key={question.id}
                        label={question.prompt}
                        required={Boolean(question.required)}
                        autosize
                        minRows={question.answerType === 'LONG_TEXT' ? 4 : 2}
                        value={questionAnswers[question.id] ?? ''}
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          const nextAnswers = {
                            ...questionAnswers,
                            [question.id]: value,
                          };
                          setQuestionAnswers(nextAnswers);
                          saveTeamRegistrationProgress({
                            step: 'questions',
                            answers: nextAnswers,
                          });
                        }}
                      />
                    ))}
                  </Stack>
                </Collapse>
              </Paper>
            ) : (
              <Text size="sm" c="dimmed">
                Submit your request and the team manager will review it.
              </Text>
            )}
            {registrationError ? (
              <Alert color="red" variant="light">
                {registrationError}
              </Alert>
            ) : null}
            <Group justify="flex-end" wrap="wrap">
              <Button
                variant="default"
                onClick={() => {
                  setShowQuestionsModal(false);
                  setQuestionsIntent(null);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" loading={actionLoading}>
                {requestOnly ? 'Submit Request' : 'Continue'}
              </Button>
            </Group>
          </Stack>
        </form>
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

      <Modal
        opened={showDiscountCodeModal && Boolean(pendingCheckoutTarget)}
        onClose={() => {
          setShowDiscountCodeModal(false);
          setPendingBillingIntent(null);
          setPendingCheckoutTarget(null);
        }}
        centered
        title="Apply discount code"
        zIndex={TEAM_SIGN_MODAL_Z_INDEX}
      >
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            Registration is {formatPrice(registrationPriceCents)} before any discount.
          </Text>
          <TextInput
            label="Discount code"
            placeholder="Enter code"
            value={discountCode}
            onChange={(event) => setDiscountCode(event.currentTarget.value)}
          />
          {registrationError ? (
            <Alert color="red" variant="light">
              {registrationError}
            </Alert>
          ) : null}
          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={() => {
                setDiscountCode('');
              }}
            >
              Clear
            </Button>
            <Button
              onClick={async () => {
                if (!pendingCheckoutTarget) {
                  return;
                }
                setActionLoading(true);
                setRegistrationError(null);
                try {
                  await startCheckout(pendingCheckoutTarget);
                } catch (error) {
                  setRegistrationError(error instanceof Error ? error.message : 'Unable to start checkout.');
                } finally {
                  setActionLoading(false);
                }
              }}
              loading={actionLoading}
            >
              Continue to payment
            </Button>
          </Group>
        </Stack>
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
          clearTeamRegistrationProgress();
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
        onPaymentPending={async () => {
          setShowPaymentModal(false);
          setPaymentData(null);
          clearTeamRegistrationProgress();
          const refreshed = await refreshTeam();
          notifications.show({
            color: 'yellow',
            message: `Payment submitted for ${refreshed?.name ?? resolvedTeam.name}. Registration is pending until the bank payment clears.`,
          });
        }}
      />
      <RegistrationHoldTimer
        expiresAt={registrationHoldExpiresAt}
        onExpire={handleTeamRegistrationHoldExpired}
      />
    </>
  );
}
