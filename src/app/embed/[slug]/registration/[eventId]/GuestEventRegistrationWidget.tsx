'use client';

import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';

type OrganizationPayload = {
  id: string;
  slug: string;
  name: string;
  brandPrimaryColor: string;
  brandAccentColor: string;
  publicCompletionRedirectUrl: string | null;
};

type EventPayload = {
  id: string;
  name: string;
  description: string | null;
  location: string | null;
  start: string | null;
  eventType: string;
  teamSignup: boolean;
  priceCents: number;
  requiredTemplateIds: string[];
};

type DivisionPayload = {
  id: string;
  key: string | null;
  name: string;
  divisionTypeId: string | null;
  priceCents: number | null;
  requiresGuardian: boolean;
};

type QuestionPayload = {
  id: string;
  prompt: string;
  answerType: 'TEXT' | 'LONG_TEXT';
  required: boolean;
};

type GuestRegistrationResponse = {
  registrationToken: string;
  requiresPayment: boolean;
  requiresSigning: boolean;
  priceCents: number;
  parent?: { email?: string | null };
  registration: { id: string; [key: string]: unknown };
  child?: { userId: string } | null;
  children?: Array<{ userId: string }>;
  team?: { id: string; eventTeamId: string; name: string } | null;
  consent?: {
    status: string;
    errors?: string[];
    missingChildEmail?: boolean;
  };
  documentDispatches?: Array<{
    registrationId: string;
    documentId: string | null;
    sentDocumentIds?: string[];
    status: string | null;
    missingChildEmail?: boolean;
    errors?: string[];
  }>;
  error?: string;
};

type SignLink = {
  templateId: string;
  type: 'PDF' | 'TEXT';
  title: string;
  documentId: string;
  signOnce?: boolean;
  content?: string;
  url?: string;
  signerContext: string;
};

type PaymentIntentResponse = {
  paymentIntent: string;
  publishableKey: string;
  feeBreakdown?: {
    eventPrice: number;
    processingFee: number;
    stripeFee: number;
    taxAmount?: number;
    totalCharge: number;
  };
  error?: string;
};

type Props = {
  organization: OrganizationPayload;
  event: EventPayload;
  divisions: DivisionPayload[];
  questions: QuestionPayload[];
  initialOccurrence: {
    slotId: string | null;
    occurrenceDate: string | null;
  };
};

type ParentForm = {
  firstName: string;
  lastName: string;
  email: string;
  dateOfBirth: string;
};

type ChildForm = {
  firstName: string;
  lastName: string;
  email: string;
  dateOfBirth: string;
  relationship: string;
};

type TeamPlayerForm = ChildForm & {
  email: string;
  guardianFirstName: string;
  guardianLastName: string;
  guardianEmail: string;
  guardianRelationship: string;
  jerseyNumber: string;
  position: string;
  isCaptain: boolean;
};

type AdultStaffForm = {
  firstName: string;
  lastName: string;
  email: string;
};

type SignerContext = 'participant' | 'parent_guardian' | 'child';

type SigningTarget = {
  key: string;
  label: string;
  signerContext: SignerContext;
  childUserId?: string | null;
};

const stripePromiseByKey = new Map<string, ReturnType<typeof loadStripe>>();

const getStripePromise = (publishableKey: string) => {
  const existing = stripePromiseByKey.get(publishableKey);
  if (existing) {
    return existing;
  }
  const next = loadStripe(publishableKey, {
    developerTools: {
      assistant: {
        enabled: false,
      },
    },
  });
  stripePromiseByKey.set(publishableKey, next);
  return next;
};

const formatPrice = (cents: number): string => (
  cents > 0
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
    : 'Free'
);

const formatDate = (value: string | null): string => {
  if (!value) return 'Date TBD';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Date TBD';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed);
};

function FieldLabel({ label, required = false }: { label: string; required?: boolean }) {
  return (
    <span className="label-line">
      <span>{label}</span>
      <span className={`field-badge ${required ? 'required' : 'optional'}`}>
        {required ? 'Required' : 'Optional'}
      </span>
    </span>
  );
}

const defaultChild = (): ChildForm => ({
  firstName: '',
  lastName: '',
  email: '',
  dateOfBirth: '',
  relationship: 'child',
});

const defaultTeamPlayer = (): TeamPlayerForm => ({
  ...defaultChild(),
  email: '',
  guardianFirstName: '',
  guardianLastName: '',
  guardianEmail: '',
  guardianRelationship: 'parent/guardian',
  jerseyNumber: '',
  position: '',
  isCaptain: false,
});

const defaultAdultStaff = (): AdultStaffForm => ({
  firstName: '',
  lastName: '',
  email: '',
});

const postJson = async <T,>(url: string, body: unknown): Promise<T> => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.error) {
    throw new Error(payload?.error ?? 'Request failed.');
  }
  return payload as T;
};

function GuestStripePaymentForm({
  clientSecret,
  onComplete,
}: {
  clientSecret: string;
  onComplete: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!stripe || !elements) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const { error: submitError } = await elements.submit();
      if (submitError) {
        setError(submitError.message ?? 'Payment details are incomplete.');
        return;
      }
      const result = await stripe.confirmPayment({
        elements,
        clientSecret,
        confirmParams: {
          return_url: window.location.href,
        },
        redirect: 'if_required',
      });
      if (result.error) {
        setError(result.error.message ?? 'Payment failed.');
        return;
      }
      onComplete();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="stripe-payment-card" onSubmit={handleSubmit}>
      <PaymentElement options={{ layout: { type: 'tabs', defaultCollapsed: false } }} />
      {error ? <p className="stripe-message error">{error}</p> : null}
      <button className="stripe-primary-button" type="submit" disabled={!stripe || submitting}>
        {submitting ? 'Processing...' : 'Pay and finish'}
      </button>
      <style jsx>{`
        .stripe-payment-card {
          background: #ffffff;
          border: 1px solid #dde3ea;
          border-radius: 8px;
          padding: 16px;
          box-shadow: 0 10px 22px rgba(15, 23, 42, 0.06);
        }
        .stripe-primary-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 44px;
          margin-top: 16px;
          border: 0;
          border-radius: 8px;
          background: var(--guest-primary, #0f766e);
          color: #ffffff;
          cursor: pointer;
          font: inherit;
          font-weight: 800;
          padding: 10px 16px;
        }
        .stripe-primary-button:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .stripe-message {
          border-radius: 8px;
          margin: 12px 0 0;
          padding: 10px 12px;
          font-size: 0.9rem;
        }
        .stripe-message.error {
          background: #fff1f2;
          color: #be123c;
          border: 1px solid #fecdd3;
        }
      `}</style>
    </form>
  );
}

export default function GuestEventRegistrationWidget({
  organization,
  event,
  divisions,
  questions,
  initialOccurrence,
}: Props) {
  const [mode, setMode] = useState<'team' | 'free_agent'>(event.teamSignup ? 'team' : 'free_agent');
  const [parent, setParent] = useState<ParentForm>({
    firstName: '',
    lastName: '',
    email: '',
    dateOfBirth: '',
  });
  const [child, setChild] = useState<ChildForm>(defaultChild);
  const [teamName, setTeamName] = useState('');
  const [teamPlayers, setTeamPlayers] = useState<TeamPlayerForm[]>([defaultTeamPlayer()]);
  const [includeCreatorAsManager, setIncludeCreatorAsManager] = useState(true);
  const [teamManager, setTeamManager] = useState<AdultStaffForm>(defaultAdultStaff);
  const [headCoach, setHeadCoach] = useState<AdultStaffForm>(defaultAdultStaff);
  const [assistantCoaches, setAssistantCoaches] = useState<AdultStaffForm[]>([]);
  const [divisionId, setDivisionId] = useState(divisions[0]?.id ?? '');
  const [answersByQuestionId, setAnswersByQuestionId] = useState<Record<string, string>>({});
  const [step, setStep] = useState<'form' | 'signing' | 'payment' | 'complete'>('form');
  const [registration, setRegistration] = useState<GuestRegistrationResponse | null>(null);
  const [signLinks, setSignLinks] = useState<SignLink[]>([]);
  const [activeSignLink, setActiveSignLink] = useState<SignLink | null>(null);
  const [activeSigningTarget, setActiveSigningTarget] = useState<SigningTarget | null>(null);
  const [completedSigningTargetKeys, setCompletedSigningTargetKeys] = useState<string[]>([]);
  const [paymentIntent, setPaymentIntent] = useState<PaymentIntentResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [discountCode, setDiscountCode] = useState('');

  const selectedDivision = divisions.find((division) => division.id === divisionId) ?? divisions[0] ?? null;
  const requiresGuardian = selectedDivision?.requiresGuardian === true;
  const displayedPrice = selectedDivision?.priceCents ?? event.priceCents;
  const hasDocumentEmailSends = Boolean(registration?.documentDispatches?.some((dispatch) => (
    Boolean(dispatch.documentId) || (dispatch.sentDocumentIds?.length ?? 0) > 0
  )));
  const stripePromise = useMemo(() => (
    paymentIntent?.publishableKey ? getStripePromise(paymentIntent.publishableKey) : null
  ), [paymentIntent?.publishableKey]);
  const signingTargets = useMemo<SigningTarget[]>(() => {
    if (!registration) {
      return [];
    }
    if (registration.team) {
      return [{
        key: 'team_creator',
        label: 'Team creator documents',
        signerContext: 'participant',
        childUserId: null,
      }];
    }
    const childTargets = [
      ...(registration.child ? [registration.child] : []),
      ...(registration.children ?? []),
    ].filter((entry, index, allTargets) => (
      Boolean(entry?.userId) && allTargets.findIndex((candidate) => candidate.userId === entry.userId) === index
    ));
    if (childTargets.length > 0) {
      return childTargets.map((entry, index) => ({
        key: `parent_guardian:${entry.userId}`,
        label: childTargets.length > 1
          ? `Parent/guardian documents for child ${index + 1}`
          : 'Parent/guardian documents',
        signerContext: 'parent_guardian',
        childUserId: entry.userId,
      }));
    }
    return [{
      key: 'participant',
      label: 'Participant documents',
      signerContext: 'participant',
      childUserId: null,
    }];
  }, [registration]);
  const pendingSigningTargets = signingTargets.filter((target) => !completedSigningTargetKeys.includes(target.key));

  useEffect(() => {
    if (typeof window === 'undefined' || window.parent === window) {
      return;
    }
    const postHeight = () => {
      window.parent.postMessage({
        type: 'bracketiq:widget-height',
        height: document.documentElement.scrollHeight,
      }, '*');
    };
    postHeight();
    const raf = window.requestAnimationFrame(postHeight);
    return () => window.cancelAnimationFrame(raf);
  }, [step, signLinks.length, activeSignLink?.templateId, paymentIntent?.paymentIntent, teamPlayers.length, assistantCoaches.length, completedSigningTargetKeys.length, divisionId, requiresGuardian, error]);

  const answers = questions.map((question) => ({
    questionId: question.id,
    answer: answersByQuestionId[question.id] ?? '',
  }));

  const submitRegistration = async (submitEvent: FormEvent) => {
    submitEvent.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        mode,
        parent,
        ...(mode === 'free_agent' && requiresGuardian ? { child } : {}),
        ...(mode === 'team'
          ? {
            team: {
              name: teamName,
              players: teamPlayers,
              includeCreatorAsManager,
              manager: includeCreatorAsManager ? undefined : teamManager,
              headCoach,
              assistantCoaches,
            },
          }
          : {}),
        divisionId: selectedDivision?.id,
        divisionTypeId: selectedDivision?.divisionTypeId,
        divisionTypeKey: selectedDivision?.key,
        slotId: initialOccurrence.slotId ?? undefined,
        occurrenceDate: initialOccurrence.occurrenceDate ?? undefined,
        answers,
      };
      const result = await postJson<GuestRegistrationResponse>(
        `/api/public/organizations/${encodeURIComponent(organization.slug)}/events/${encodeURIComponent(event.id)}/guest-registrations`,
        payload,
      );
      setRegistration(result);
      setCompletedSigningTargetKeys([]);
      setSignLinks([]);
      setActiveSignLink(null);
      setActiveSigningTarget(null);
      if (result.requiresSigning) {
        setStep('signing');
      } else if (result.requiresPayment) {
        await startPayment(result);
      } else {
        setStep('complete');
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Registration failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const advanceAfterSigningTarget = async (target: SigningTarget) => {
    if (!registration) {
      return;
    }
    const nextCompletedKeys = completedSigningTargetKeys.includes(target.key)
      ? completedSigningTargetKeys
      : [...completedSigningTargetKeys, target.key];
    setCompletedSigningTargetKeys(nextCompletedKeys);
    setSignLinks([]);
    setActiveSignLink(null);
    setActiveSigningTarget(null);

    const remainingTargets = signingTargets.filter((candidate) => (
      candidate.key !== target.key && !nextCompletedKeys.includes(candidate.key)
    ));
    if (remainingTargets.length > 0) {
      return;
    }
    if (registration.requiresPayment) {
      await startPayment(registration);
      return;
    }
    setStep('complete');
  };

  const loadSignLinks = async (target: SigningTarget) => {
    if (!registration) {
      return;
    }
    setActiveSigningTarget(target);
    setSubmitting(true);
    setError(null);
    try {
      const result = await postJson<{ signLinks: SignLink[] }>(
        `/api/public/organizations/${encodeURIComponent(organization.slug)}/events/${encodeURIComponent(event.id)}/guest-sign`,
        {
          registrationToken: registration.registrationToken,
          signerContext: target.signerContext,
          childUserId: target.childUserId ?? undefined,
          redirectUrl: window.location.href,
        },
      );
      setSignLinks(result.signLinks);
      setActiveSignLink(result.signLinks[0] ?? null);
      if (!result.signLinks.length) {
        await advanceAfterSigningTarget(target);
      }
    } catch (signError) {
      setError(signError instanceof Error ? signError.message : 'Unable to load signing links.');
    } finally {
      setSubmitting(false);
    }
  };

  const recordTextSignatures = async (target: SigningTarget) => {
    const textLinks = signLinks.filter((link) => link.type === 'TEXT');
    if (!registration || !textLinks.length) {
      return;
    }
    await Promise.all(textLinks.map((link) => postJson<{ ok: boolean }>(
      `/api/public/organizations/${encodeURIComponent(organization.slug)}/events/${encodeURIComponent(event.id)}/guest-record-signature`,
      {
        registrationToken: registration.registrationToken,
        templateId: link.templateId,
        documentId: link.documentId,
        type: 'TEXT',
        signerContext: link.signerContext || target.signerContext,
        childUserId: target.childUserId ?? undefined,
      },
    )));
  };

  const finishSigning = async () => {
    if (!registration || !activeSigningTarget) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await recordTextSignatures(activeSigningTarget);
      await advanceAfterSigningTarget(activeSigningTarget);
    } catch (signError) {
      setError(signError instanceof Error ? signError.message : 'Unable to save document acknowledgement.');
    } finally {
      setSubmitting(false);
    }
  };

  const startPayment = async (currentRegistration: GuestRegistrationResponse = registration as GuestRegistrationResponse) => {
    setSubmitting(true);
    setError(null);
    try {
      const intent = await postJson<PaymentIntentResponse>(
        `/api/public/organizations/${encodeURIComponent(organization.slug)}/events/${encodeURIComponent(event.id)}/guest-payment-intent`,
        {
          registrationToken: currentRegistration.registrationToken,
          ...(discountCode.trim() ? { discountCode: discountCode.trim() } : {}),
        },
      );
      setPaymentIntent(intent);
      setStep('payment');
    } catch (paymentError) {
      setError(paymentError instanceof Error ? paymentError.message : 'Unable to start payment.');
    } finally {
      setSubmitting(false);
    }
  };

  const addTeamPlayer = () => {
    setTeamPlayers((current) => [...current, defaultTeamPlayer()]);
  };

  const updateTeamPlayer = (index: number, patch: Partial<TeamPlayerForm>) => {
    setTeamPlayers((current) => current.map((player, playerIndex) => (
      playerIndex === index ? { ...player, ...patch } : player
    )));
  };

  const removeTeamPlayer = (index: number) => {
    setTeamPlayers((current) => current.filter((_, playerIndex) => playerIndex !== index));
  };

  const addAssistantCoach = () => {
    setAssistantCoaches((current) => [...current, defaultAdultStaff()]);
  };

  const updateAssistantCoach = (index: number, patch: Partial<AdultStaffForm>) => {
    setAssistantCoaches((current) => current.map((coach, coachIndex) => (
      coachIndex === index ? { ...coach, ...patch } : coach
    )));
  };

  const removeAssistantCoach = (index: number) => {
    setAssistantCoaches((current) => current.filter((_, coachIndex) => coachIndex !== index));
  };

  return (
    <main
      className="guest-widget"
      style={{
        '--guest-primary': organization.brandPrimaryColor,
        '--guest-accent': organization.brandAccentColor,
      } as CSSProperties}
    >
      <header className="guest-header">
        <div>
          <span>{organization.name}</span>
          <h1>{event.name}</h1>
          <p>{formatDate(event.start)}{event.location ? ` · ${event.location}` : ''}</p>
        </div>
        <strong>{formatPrice(displayedPrice)}</strong>
      </header>

      {step === 'form' ? (
        <form className="guest-card" onSubmit={submitRegistration}>
          {event.teamSignup ? (
            <div className="segmented" role="tablist" aria-label="Registration type">
              <button type="button" className={mode === 'team' ? 'active' : ''} onClick={() => setMode('team')}>
                Team
              </button>
              <button type="button" className={mode === 'free_agent' ? 'active' : ''} onClick={() => setMode('free_agent')}>
                Free agent
              </button>
            </div>
          ) : null}

          <section>
            <h2>{mode === 'team' ? 'Team Creator' : requiresGuardian ? 'Parent/Guardian Info' : 'Participant Info'}</h2>
            <div className="field-grid">
              <label>
                <FieldLabel label="First name" required />
                <input required value={parent.firstName} onChange={(e) => setParent({ ...parent, firstName: e.target.value })} autoComplete="given-name" />
              </label>
              <label>
                <FieldLabel label="Last name" required />
                <input required value={parent.lastName} onChange={(e) => setParent({ ...parent, lastName: e.target.value })} autoComplete="family-name" />
              </label>
              <label>
                <FieldLabel label="Email" required />
                <input required type="email" value={parent.email} onChange={(e) => setParent({ ...parent, email: e.target.value })} autoComplete="email" />
              </label>
            </div>
          </section>

          {divisions.length > 0 ? (
            <section>
              <h2>Division</h2>
              <label>
                <FieldLabel label="Division" required />
                <select value={divisionId} onChange={(event) => setDivisionId(event.target.value)}>
                  {divisions.map((division) => (
                    <option key={division.id} value={division.id}>
                      {division.name}{division.priceCents != null ? ` · ${formatPrice(division.priceCents)}` : ''}
                    </option>
                  ))}
                </select>
              </label>
            </section>
          ) : null}

          {mode === 'free_agent' ? (requiresGuardian ? (
            <section>
              <h2>Player Info</h2>
              <div className="field-grid">
                <label>
                  <FieldLabel label="Player first name" required />
                  <input required value={child.firstName} onChange={(e) => setChild({ ...child, firstName: e.target.value })} />
                </label>
                <label>
                  <FieldLabel label="Player last name" required />
                  <input required value={child.lastName} onChange={(e) => setChild({ ...child, lastName: e.target.value })} />
                </label>
                <label>
                  <FieldLabel label="Player email" />
                  <input type="email" value={child.email} onChange={(e) => setChild({ ...child, email: e.target.value })} autoComplete="email" />
                </label>
                <label>
                  <FieldLabel label="Player date of birth" required />
                  <input required type="date" value={child.dateOfBirth} onChange={(e) => setChild({ ...child, dateOfBirth: e.target.value })} />
                </label>
                <label>
                  <FieldLabel label="Relationship" />
                  <input value={child.relationship} onChange={(e) => setChild({ ...child, relationship: e.target.value })} />
                </label>
              </div>
            </section>
          ) : null) : (
            <section>
              <h2>Team Info</h2>
              <label>
                <FieldLabel label="Team name" required />
                <input required value={teamName} onChange={(e) => setTeamName(e.target.value)} />
              </label>
              <div className="subsection">
                <h3>Team Staff</h3>
                <label className="check-row">
                  <input type="checkbox" checked={includeCreatorAsManager} onChange={(event) => setIncludeCreatorAsManager(event.target.checked)} />
                  Team creator is manager
                </label>
                {!includeCreatorAsManager ? (
                  <div className="field-grid">
                    <label>
                      <FieldLabel label="Manager first name" />
                      <input value={teamManager.firstName} onChange={(e) => setTeamManager({ ...teamManager, firstName: e.target.value })} autoComplete="given-name" />
                    </label>
                    <label>
                      <FieldLabel label="Manager last name" />
                      <input value={teamManager.lastName} onChange={(e) => setTeamManager({ ...teamManager, lastName: e.target.value })} autoComplete="family-name" />
                    </label>
                    <label>
                      <FieldLabel label="Manager email" />
                      <input type="email" value={teamManager.email} onChange={(e) => setTeamManager({ ...teamManager, email: e.target.value })} autoComplete="email" />
                    </label>
                  </div>
                ) : null}
                <div className="field-grid">
                  <label>
                    <FieldLabel label="Head coach first name" />
                    <input value={headCoach.firstName} onChange={(e) => setHeadCoach({ ...headCoach, firstName: e.target.value })} autoComplete="given-name" />
                  </label>
                  <label>
                    <FieldLabel label="Head coach last name" />
                    <input value={headCoach.lastName} onChange={(e) => setHeadCoach({ ...headCoach, lastName: e.target.value })} autoComplete="family-name" />
                  </label>
                  <label>
                    <FieldLabel label="Head coach email" />
                    <input type="email" value={headCoach.email} onChange={(e) => setHeadCoach({ ...headCoach, email: e.target.value })} autoComplete="email" />
                  </label>
                </div>
                <div className="staff-list">
                  {assistantCoaches.map((coach, index) => (
                    <div className="staff-row" key={index}>
                      <div className="field-grid">
                        <label>
                          <FieldLabel label={`Assistant coach ${index + 1} first name`} />
                          <input value={coach.firstName} onChange={(e) => updateAssistantCoach(index, { firstName: e.target.value })} autoComplete="given-name" />
                        </label>
                        <label>
                          <FieldLabel label={`Assistant coach ${index + 1} last name`} />
                          <input value={coach.lastName} onChange={(e) => updateAssistantCoach(index, { lastName: e.target.value })} autoComplete="family-name" />
                        </label>
                        <label>
                          <FieldLabel label={`Assistant coach ${index + 1} email`} />
                          <input type="email" value={coach.email} onChange={(e) => updateAssistantCoach(index, { email: e.target.value })} autoComplete="email" />
                        </label>
                      </div>
                      <button className="text-button" type="button" onClick={() => removeAssistantCoach(index)}>Remove</button>
                    </div>
                  ))}
                </div>
                <button className="secondary-button" type="button" onClick={addAssistantCoach}>Add assistant coach</button>
              </div>
              <div className="subsection">
                <h3>Players</h3>
              <div className="roster-list">
                {teamPlayers.map((player, index) => (
                  <div className="roster-row" key={index}>
                    <div className="field-grid">
                      <label>
                        <FieldLabel label="Player first name" required />
                        <input required value={player.firstName} onChange={(e) => updateTeamPlayer(index, { firstName: e.target.value })} />
                      </label>
                      <label>
                        <FieldLabel label="Player last name" required />
                        <input required value={player.lastName} onChange={(e) => updateTeamPlayer(index, { lastName: e.target.value })} />
                      </label>
                      {requiresGuardian ? (
                        <>
                          <label>
                            <FieldLabel label="Player date of birth" required />
                            <input required type="date" value={player.dateOfBirth} onChange={(e) => updateTeamPlayer(index, { dateOfBirth: e.target.value })} />
                          </label>
                          <label>
                            <FieldLabel label="Player email" />
                            <input type="email" value={player.email} onChange={(e) => updateTeamPlayer(index, { email: e.target.value })} autoComplete="email" />
                          </label>
                          <label>
                            <FieldLabel label="Parent/guardian email" required />
                            <input required type="email" value={player.guardianEmail} onChange={(e) => updateTeamPlayer(index, { guardianEmail: e.target.value })} autoComplete="email" />
                          </label>
                          <label>
                            <FieldLabel label="Parent/guardian first name" required />
                            <input required value={player.guardianFirstName} onChange={(e) => updateTeamPlayer(index, { guardianFirstName: e.target.value })} autoComplete="given-name" />
                          </label>
                          <label>
                            <FieldLabel label="Parent/guardian last name" required />
                            <input required value={player.guardianLastName} onChange={(e) => updateTeamPlayer(index, { guardianLastName: e.target.value })} autoComplete="family-name" />
                          </label>
                          <label>
                            <FieldLabel label="Relationship" />
                            <input value={player.guardianRelationship} onChange={(e) => updateTeamPlayer(index, { guardianRelationship: e.target.value })} />
                          </label>
                        </>
                      ) : (
                        <label>
                          <FieldLabel label="Player email" required />
                          <input required type="email" value={player.email} onChange={(e) => updateTeamPlayer(index, { email: e.target.value })} autoComplete="email" />
                        </label>
                      )}
                      <label>
                        <FieldLabel label="Jersey" />
                        <input value={player.jerseyNumber} onChange={(e) => updateTeamPlayer(index, { jerseyNumber: e.target.value })} />
                      </label>
                      <label>
                        <FieldLabel label="Player position" />
                        <input value={player.position} onChange={(e) => updateTeamPlayer(index, { position: e.target.value })} />
                      </label>
                    </div>
                    <label className="check-row">
                      <input type="checkbox" checked={player.isCaptain} onChange={(event) => updateTeamPlayer(index, { isCaptain: event.target.checked })} />
                      Captain
                    </label>
                    {teamPlayers.length > 1 ? (
                      <button className="text-button" type="button" onClick={() => removeTeamPlayer(index)}>Remove</button>
                    ) : null}
                  </div>
                ))}
              </div>
              <button className="secondary-button" type="button" onClick={addTeamPlayer}>Add player</button>
              </div>
            </section>
          )}

          {questions.length > 0 ? (
            <section>
              <h2>Questions</h2>
              <div className="question-list">
                {questions.map((question) => (
                  <label key={question.id}>
                    <FieldLabel label={question.prompt} required={question.required} />
                    {question.answerType === 'LONG_TEXT' ? (
                      <textarea
                        required={question.required}
                        value={answersByQuestionId[question.id] ?? ''}
                        onChange={(event) => setAnswersByQuestionId({
                          ...answersByQuestionId,
                          [question.id]: event.target.value,
                        })}
                      />
                    ) : (
                      <input
                        required={question.required}
                        value={answersByQuestionId[question.id] ?? ''}
                        onChange={(event) => setAnswersByQuestionId({
                          ...answersByQuestionId,
                          [question.id]: event.target.value,
                        })}
                      />
                    )}
                  </label>
                ))}
              </div>
            </section>
          ) : null}

          {error ? <p className="message error">{error}</p> : null}
          {displayedPrice > 0 ? (
            <label>
              Discount code
              <input
                value={discountCode}
                onChange={(event) => setDiscountCode(event.target.value)}
                placeholder="Enter code"
              />
            </label>
          ) : null}
          <button className="primary-button" type="submit" disabled={submitting}>
            {submitting ? 'Submitting...' : 'Continue'}
          </button>
        </form>
      ) : null}

      {step === 'signing' && registration ? (
        <section className="guest-card">
          <h2>Documents</h2>
          {registration.consent?.missingChildEmail ? (
            <p className="message warning">A child email will be needed later for child-only signatures.</p>
          ) : null}
          {!signLinks.length ? (
            <div className="button-row">
              {pendingSigningTargets.length > 0 ? pendingSigningTargets.map((target) => (
                <button key={target.key} className="primary-button" type="button" disabled={submitting} onClick={() => loadSignLinks(target)}>
                  {target.label}
                </button>
              )) : (
                <>
                  {displayedPrice > 0 ? (
                    <label>
                      Discount code
                      <input
                        value={discountCode}
                        onChange={(event) => setDiscountCode(event.target.value)}
                        placeholder="Enter code"
                      />
                    </label>
                  ) : null}
                  <button className="primary-button" type="button" disabled={submitting} onClick={() => (registration.requiresPayment ? startPayment(registration) : setStep('complete'))}>
                    Continue
                  </button>
                </>
              )}
            </div>
          ) : (
            <>
              {activeSigningTarget ? <p className="signing-label">{activeSigningTarget.label}</p> : null}
              <div className="sign-tabs">
                {signLinks.map((link) => (
                  <button key={`${link.templateId}:${link.signerContext}`} type="button" className={activeSignLink?.templateId === link.templateId ? 'active' : ''} onClick={() => setActiveSignLink(link)}>
                    {link.title}
                  </button>
                ))}
              </div>
              {activeSignLink?.type === 'PDF' && activeSignLink.url ? (
                <iframe title={activeSignLink.title} src={activeSignLink.url} className="sign-frame" />
              ) : activeSignLink ? (
                <div className="text-document">{activeSignLink.content}</div>
              ) : null}
              <button className="primary-button" type="button" disabled={submitting} onClick={finishSigning}>
                Continue
              </button>
            </>
          )}
          {error ? <p className="message error">{error}</p> : null}
        </section>
      ) : null}

      {step === 'payment' && paymentIntent ? (
        <section>
          <div className="payment-summary">
            <span>Total</span>
            <strong>{formatPrice(paymentIntent.feeBreakdown?.totalCharge ?? registration?.priceCents ?? displayedPrice)}</strong>
          </div>
          {stripePromise ? (
            <Elements stripe={stripePromise} options={{ clientSecret: paymentIntent.paymentIntent }}>
              <GuestStripePaymentForm clientSecret={paymentIntent.paymentIntent} onComplete={() => setStep('complete')} />
            </Elements>
          ) : (
            <p className="message error">Payment is not configured.</p>
          )}
          {error ? <p className="message error">{error}</p> : null}
        </section>
      ) : null}

      {step === 'complete' ? (
        <section className="guest-card complete">
          <h2>Registration Received</h2>
          <p>A receipt and registration details will be sent to {registration?.parent?.email ?? parent.email}.</p>
          {hasDocumentEmailSends ? (
            <p>Document signing emails have been sent to the available player or parent/guardian contacts.</p>
          ) : null}
          {organization.publicCompletionRedirectUrl ? (
            <a className="primary-button link-button" href={organization.publicCompletionRedirectUrl} target="_top" rel="noopener">
              Return to {organization.name}
            </a>
          ) : null}
        </section>
      ) : null}

      <style jsx>{`
        .guest-widget {
          min-height: 100vh;
          background: #f7f8fb;
          color: #17202a;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          padding: 18px;
        }
        .guest-header {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: flex-start;
          border-bottom: 1px solid #dde3ea;
          padding-bottom: 16px;
          margin-bottom: 18px;
        }
        .guest-header span {
          color: var(--guest-primary);
          font-size: 0.84rem;
          font-weight: 700;
        }
        .guest-header h1 {
          font-size: 1.6rem;
          line-height: 1.1;
          margin: 4px 0 6px;
          letter-spacing: 0;
        }
        .guest-header p {
          margin: 0;
          color: #5d6978;
        }
        .guest-header strong {
          color: #0d2b2a;
          background: #e8f4f1;
          border: 1px solid #c9e5df;
          border-radius: 8px;
          padding: 8px 10px;
          white-space: nowrap;
        }
        .guest-card {
          background: #ffffff;
          border: 1px solid #dde3ea;
          border-radius: 8px;
          padding: 16px;
          box-shadow: 0 10px 22px rgba(15, 23, 42, 0.06);
        }
        section + section {
          margin-top: 18px;
        }
        h2 {
          font-size: 1rem;
          margin: 0 0 10px;
          letter-spacing: 0;
        }
        h3 {
          font-size: 0.92rem;
          margin: 0 0 10px;
          letter-spacing: 0;
        }
        label {
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-size: 0.86rem;
          font-weight: 650;
          color: #2d3744;
        }
        :global(.label-line) {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        :global(.field-badge) {
          padding: 0;
          font-size: 0.68rem;
          font-weight: 750;
          line-height: 1.2;
        }
        :global(.field-badge.required) {
          color: #9f1239;
        }
        :global(.field-badge.optional) {
          color: #5d6978;
        }
        input,
        select,
        textarea {
          width: 100%;
          min-height: 42px;
          border: 1px solid #cfd8e3;
          border-radius: 8px;
          padding: 9px 10px;
          font: inherit;
          font-weight: 500;
          color: #111827;
          background: #ffffff;
        }
        textarea {
          min-height: 96px;
          resize: vertical;
        }
        .field-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }
        .segmented,
        .button-row,
        .sign-tabs {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 16px;
        }
        .segmented button,
        .sign-tabs button {
          border: 1px solid #cfd8e3;
          border-radius: 8px;
          background: #ffffff;
          color: #334155;
          padding: 9px 12px;
          font-weight: 700;
          cursor: pointer;
        }
        .segmented button.active,
        .sign-tabs button.active {
          border-color: var(--guest-primary);
          background: #e8f4f1;
          color: #0d2b2a;
        }
        .check-row {
          flex-direction: row;
          align-items: center;
          margin-bottom: 12px;
        }
        .check-row input {
          width: 18px;
          min-height: 18px;
        }
        .roster-list,
        .staff-list,
        .question-list {
          display: grid;
          gap: 12px;
        }
        .subsection {
          margin-top: 14px;
        }
        .subsection + .subsection {
          margin-top: 18px;
        }
        .staff-row,
        .roster-row {
          border: 1px solid #edf1f5;
          border-radius: 8px;
          padding: 12px;
          background: #fbfcfd;
        }
        .primary-button,
        .secondary-button,
        .text-button {
          border: 0;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 800;
          min-height: 42px;
          padding: 10px 14px;
        }
        .primary-button {
          background: var(--guest-primary);
          color: #ffffff;
          margin-top: 16px;
        }
        .secondary-button {
          background: #e9eef4;
          color: #1f2937;
        }
        .text-button {
          background: transparent;
          color: #b42318;
          padding-left: 0;
        }
        .primary-button:disabled,
        .secondary-button:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .message {
          border-radius: 8px;
          padding: 10px 12px;
          font-size: 0.9rem;
        }
        .message.error {
          background: #fff1f2;
          color: #be123c;
          border: 1px solid #fecdd3;
        }
        .message.warning {
          background: #fff8e5;
          color: #8a5a00;
          border: 1px solid #f5d58b;
        }
        .sign-frame {
          width: 100%;
          height: min(680px, 72vh);
          border: 1px solid #cfd8e3;
          border-radius: 8px;
          background: #ffffff;
        }
        .signing-label {
          color: #4b5563;
          font-weight: 700;
          margin: 0 0 10px;
        }
        .text-document {
          border: 1px solid #cfd8e3;
          border-radius: 8px;
          padding: 14px;
          white-space: pre-wrap;
          background: #ffffff;
        }
        .payment-summary {
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: #ffffff;
          border: 1px solid #dde3ea;
          border-radius: 8px;
          padding: 12px 14px;
          margin-bottom: 12px;
        }
        .complete p {
          color: #4b5563;
        }
        .link-button {
          display: inline-flex;
          align-items: center;
          text-decoration: none;
        }
        @media (max-width: 640px) {
          .guest-widget {
            padding: 14px;
          }
          .guest-header {
            flex-direction: column;
          }
          .field-grid {
            grid-template-columns: 1fr;
          }
          .guest-header strong {
            white-space: normal;
          }
        }
      `}</style>
    </main>
  );
}
