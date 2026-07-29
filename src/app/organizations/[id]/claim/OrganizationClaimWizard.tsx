'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  Alert,
  Anchor,
  Badge,
  Button,
  Checkbox,
  Container,
  CopyButton,
  Group,
  List,
  Loader,
  Paper,
  Radio,
  Select,
  Stack,
  Stepper,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import {
  CheckCircle2,
  ClipboardCheck,
  Copy,
  FileCode2,
  Mail,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';

import { useApp } from '@/app/providers';
import Navigation from '@/components/layout/Navigation';
import OrganizationOwnershipBadges from '@/components/ui/OrganizationOwnershipBadges';
import { isApiRequestError } from '@/lib/apiClient';
import {
  organizationClaimService,
  type OrganizationClaim,
  type OrganizationClaimMethod,
  type OrganizationClaimPresentation,
  type OrganizationClaimRequestType,
  type OrganizationOwnershipIssueReason,
  type OrganizationOwnershipRequestedOutcome,
} from '@/lib/organizationClaimService';
import type { Organization } from '@/types';

const METHOD_LABELS: Record<OrganizationClaimMethod, string> = {
  DOMAIN_EMAIL: 'Email at the organization domain',
  DNS_TXT: 'DNS record',
  HTML_META: 'Website meta tag',
  MANUAL_REVIEW: 'Manual review',
};

const METHOD_DESCRIPTIONS: Record<OrganizationClaimMethod, string> = {
  DOMAIN_EMAIL: 'We send a secure verification link to an email address on the organization website domain.',
  DNS_TXT: 'Add a temporary TXT record to the organization domain, then ask BracketIQ to check it.',
  HTML_META: 'Add a temporary verification tag to the organization website homepage.',
  MANUAL_REVIEW: 'Provide your role and public evidence for review by a BracketIQ administrator.',
};

const ISSUE_REASON_OPTIONS: Array<{ value: OrganizationOwnershipIssueReason; label: string }> = [
  { value: 'FORMER_REPRESENTATIVE', label: 'A former representative still controls the profile' },
  { value: 'OWNER_UNAVAILABLE', label: 'The current profile owner is unavailable' },
  { value: 'UNAUTHORIZED_OR_MISLEADING_CLAIM', label: 'The claim is unauthorized or misleading' },
  { value: 'DUPLICATE_OR_INCORRECT_PROFILE', label: 'This is a duplicate or incorrect profile' },
  { value: 'OTHER', label: 'Another ownership issue' },
];

const OUTCOME_OPTIONS: Array<{ value: OrganizationOwnershipRequestedOutcome; label: string }> = [
  { value: 'OWNERSHIP_TRANSFER', label: 'Transfer ownership to the correct representative' },
  { value: 'REVIEW_OR_REVOKE_CLAIM', label: 'Review or revoke the current claim' },
  { value: 'MERGE_OR_CORRECT_PROFILE', label: 'Merge or correct this profile' },
];

const MANUAL_OR_REVIEW_STATUSES = new Set([
  'PENDING_MANUAL_REVIEW',
  'DISPUTED',
]);

const extractErrorData = (error: unknown): Record<string, unknown> => (
  isApiRequestError(error) && error.data && typeof error.data === 'object'
    ? error.data as Record<string, unknown>
    : {}
);

const requestTypeFromQuery = (
  value: string | null,
  presentation: OrganizationClaimPresentation,
): OrganizationClaimRequestType | null => {
  if (presentation.claimable) return 'INITIAL_CLAIM';
  if (value === 'OWNERSHIP_TRANSFER' || value === 'OWNERSHIP_DISPUTE') return value;
  return null;
};

const requestTypeTitle = (requestType: OrganizationClaimRequestType): string => {
  if (requestType === 'OWNERSHIP_TRANSFER') return 'Request ownership transfer';
  if (requestType === 'OWNERSHIP_DISPUTE') return 'Report an ownership issue';
  if (requestType === 'DUPLICATE_PROFILE_REVIEW') return 'Request a duplicate profile review';
  return 'Claim this organization';
};

const verificationMethodIntroduction = (
  requestType: OrganizationClaimRequestType,
): string => {
  if (requestType === 'OWNERSHIP_TRANSFER') {
    return 'Choose the strongest verification method available. Ownership transfers remain under review until the current ownership and your evidence are resolved.';
  }
  if (requestType === 'OWNERSHIP_DISPUTE') {
    return 'Choose the strongest verification method available. Website or domain control can strengthen the ownership issue you submit for review.';
  }
  return 'Choose the strongest verification method you can complete. Website or domain control usually provides the fastest verification.';
};

const methodIcon = (method: OrganizationClaimMethod) => {
  if (method === 'DOMAIN_EMAIL') return <Mail size={18} />;
  if (method === 'DNS_TXT') return <ClipboardCheck size={18} />;
  if (method === 'HTML_META') return <FileCode2 size={18} />;
  return <ShieldCheck size={18} />;
};

export default function OrganizationClaimWizard() {
  const params = useParams<{ id: string }>();
  const organizationId = String(params.id ?? '');
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, loading: authLoading } = useApp();
  const queryClaimId = searchParams.get('claimId');
  const queryRequestType = searchParams.get('requestType');

  const [presentation, setPresentation] = useState<OrganizationClaimPresentation | null>(null);
  const [claim, setClaim] = useState<OrganizationClaim | null>(null);
  const [requestType, setRequestType] = useState<OrganizationClaimRequestType | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<OrganizationClaimMethod | null>(null);
  const [method, setMethod] = useState<OrganizationClaimMethod | null>(null);
  const [verificationEmail, setVerificationEmail] = useState('');
  const [roleTitle, setRoleTitle] = useState('');
  const [explanation, setExplanation] = useState('');
  const [publicEvidenceUrl, setPublicEvidenceUrl] = useState('');
  const [officialContactName, setOfficialContactName] = useState('');
  const [officialContactEmail, setOfficialContactEmail] = useState('');
  const [officialContactPhone, setOfficialContactPhone] = useState('');
  const [officialContactUrl, setOfficialContactUrl] = useState('');
  const [issueReason, setIssueReason] = useState<OrganizationOwnershipIssueReason | null>(null);
  const [requestedOutcome, setRequestedOutcome] = useState<OrganizationOwnershipRequestedOutcome | null>(null);
  const [certified, setCertified] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [mfaChallengeId, setMfaChallengeId] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaSetupUrl, setMfaSetupUrl] = useState('');

  const load = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError('');
    try {
      const nextPresentation = await organizationClaimService.getPresentation(organizationId);
      setPresentation(nextPresentation);
      const resolvedRequestType = requestTypeFromQuery(queryRequestType, nextPresentation);
      setRequestType((current) => current ?? resolvedRequestType);
      const claimId = queryClaimId || nextPresentation.viewerClaimId;
      if (claimId && user) {
        const nextClaim = await organizationClaimService.getClaim(organizationId, claimId);
        setClaim(nextClaim);
        setRequestType(nextClaim.requestType);
        setSelectedMethod(nextClaim.method);
        setMethod(nextClaim.method);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load this organization claim.');
    } finally {
      setLoading(false);
    }
  }, [organizationId, queryClaimId, queryRequestType, user]);

  useEffect(() => {
    if (!authLoading) void load();
  }, [authLoading, load]);

  const supportedMethods = useMemo(
    () => presentation?.supportedMethods ?? [],
    [presentation],
  );
  const needsRepresentativeDetails = Boolean(
    method === 'MANUAL_REVIEW' || (requestType && requestType !== 'INITIAL_CLAIM'),
  );
  const activeStep = claim
    ? 3
    : requestType
      ? method
        ? 2
        : 1
      : 0;

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!requestType || !method) return;
    if (method === 'DOMAIN_EMAIL' && !verificationEmail.trim()) {
      setError('Enter an email address on the organization website domain.');
      return;
    }
    if (needsRepresentativeDetails && (!roleTitle.trim() || !explanation.trim())) {
      setError('Tell us your role and explain why you should represent this organization.');
      return;
    }
    if (requestType === 'OWNERSHIP_DISPUTE' && (!issueReason || !requestedOutcome || !certified)) {
      setError('Choose the ownership issue, requested outcome, and certify that the report is accurate.');
      return;
    }

    setSaving(true);
    setError('');
    setNotice('');
    try {
      const nextClaim = await organizationClaimService.createClaim(organizationId, {
        requestType,
        method,
        verificationEmail: verificationEmail.trim() || null,
        roleTitle: roleTitle.trim() || null,
        explanation: explanation.trim() || null,
        publicEvidenceUrl: publicEvidenceUrl.trim() || null,
        officialContactName: officialContactName.trim() || null,
        officialContactEmail: officialContactEmail.trim() || null,
        officialContactPhone: officialContactPhone.trim() || null,
        officialContactUrl: officialContactUrl.trim() || null,
        issueReason,
        requestedOutcome,
        certified,
      });
      setClaim(nextClaim);
      const nextUrl = `/organizations/${encodeURIComponent(organizationId)}/claim?claimId=${encodeURIComponent(nextClaim.id)}`;
      router.replace(nextUrl);
      setNotice(
        nextClaim.status === 'PENDING_MANUAL_REVIEW' || nextClaim.status === 'DISPUTED'
          ? 'Your request was submitted for administrator review.'
          : 'Your ownership verification has started.',
      );
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to create this claim.');
    } finally {
      setSaving(false);
    }
  };

  const refreshClaim = async () => {
    if (!claim) return;
    setSaving(true);
    setError('');
    try {
      setClaim(await organizationClaimService.getClaim(organizationId, claim.id));
      setNotice('Claim status refreshed.');
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Unable to refresh the claim.');
    } finally {
      setSaving(false);
    }
  };

  const verifyClaim = async () => {
    if (!claim) return;
    setSaving(true);
    setError('');
    try {
      const nextClaim = await organizationClaimService.verifyClaim(organizationId, claim.id);
      setClaim(nextClaim);
      setNotice(
        nextClaim.status === 'APPROVED_PENDING_ACCEPTANCE'
          ? 'Website control verified. Confirm ownership to finish.'
          : 'Verification checked. If the change has not propagated yet, try again later.',
      );
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : 'Unable to verify website control.');
    } finally {
      setSaving(false);
    }
  };

  const cancelClaim = async () => {
    if (!claim) return;
    setSaving(true);
    setError('');
    try {
      setClaim(await organizationClaimService.cancelClaim(organizationId, claim.id));
      setNotice('The claim request was cancelled.');
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : 'Unable to cancel this claim.');
    } finally {
      setSaving(false);
    }
  };

  const startMfa = async () => {
    if (!claim) return;
    setSaving(true);
    setError('');
    setMfaSetupUrl('');
    try {
      const challenge = await organizationClaimService.startMfa(organizationId, claim.id);
      setMfaChallengeId(challenge.challengeId);
      setNotice('Enter the code from your authenticator app.');
    } catch (mfaError) {
      const data = extractErrorData(mfaError);
      if (data.code === 'MFA_SETUP_REQUIRED_FOR_ORGANIZATION_CLAIM' && typeof data.setupUrl === 'string') {
        setMfaSetupUrl(data.setupUrl);
        setNotice('Set up an authenticator before accepting organization ownership.');
      } else {
        setError(mfaError instanceof Error ? mfaError.message : 'Unable to start ownership confirmation.');
      }
    } finally {
      setSaving(false);
    }
  };

  const confirmMfa = async (event: FormEvent) => {
    event.preventDefault();
    if (!claim || !mfaChallengeId || mfaCode.trim().length < 6) {
      setError('Enter the code from your authenticator app.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const nextClaim = await organizationClaimService.confirmMfa(organizationId, claim.id, {
        challengeId: mfaChallengeId,
        code: mfaCode.trim(),
      });
      setClaim(nextClaim);
      setNotice('Organization ownership confirmed.');
    } catch (confirmError) {
      setError(confirmError instanceof Error ? confirmError.message : 'Unable to confirm organization ownership.');
    } finally {
      setSaving(false);
    }
  };

  const organizationForBadges = presentation ? {
    $id: presentation.organizationId,
    name: presentation.organizationName,
    originType: presentation.originType,
    ownershipStatus: presentation.ownershipStatus,
    claimVerificationLevel: presentation.claimVerificationLevel,
  } as Organization : null;

  if (authLoading || loading) {
    return (
      <>
        <Navigation />
        <Container size="md" py="xl"><Loader /></Container>
      </>
    );
  }

  if (!presentation) {
    return (
      <>
        <Navigation />
        <Container size="md" py="xl">
          <Alert color="red" title="Unable to load organization">{error || 'Organization not found.'}</Alert>
        </Container>
      </>
    );
  }

  const currentPath = `/organizations/${encodeURIComponent(organizationId)}/claim${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;

  return (
    <>
      <Navigation />
      <Container size="md" py={{ base: 'lg', sm: 'xl' }}>
        <Stack gap="lg">
          <div>
            <Text size="sm" c="dimmed" mb={4}>Organization ownership</Text>
            <Group justify="space-between" align="flex-start" wrap="wrap">
              <div>
                <Title order={1} size="h2">{presentation.organizationName}</Title>
                {presentation.displayDomain ? (
                  <Text c="dimmed">{presentation.displayDomain}</Text>
                ) : null}
              </div>
              {organizationForBadges ? <OrganizationOwnershipBadges organization={organizationForBadges} /> : null}
            </Group>
          </div>

          <Stepper active={activeStep} size="sm" allowNextStepsSelect={false}>
            <Stepper.Step label="Request" description="Choose the ownership action" />
            <Stepper.Step label="Method" description="Choose verification" />
            <Stepper.Step label="Details" description="Submit evidence" />
            <Stepper.Step label="Status" description="Track and finish" />
          </Stepper>

          {error ? <Alert color="red" icon={<TriangleAlert size={18} />}>{error}</Alert> : null}
          {notice ? <Alert color="blue">{notice}</Alert> : null}

          {!user ? (
            <Paper withBorder radius="md" p="lg">
              <Stack gap="sm">
                <Title order={2} size="h3">Sign in to continue</Title>
                <Text c="dimmed">
                  Ownership requests are tied to a verified BracketIQ account so we can protect the organization and contact you about the decision.
                </Text>
                <Button
                  component={Link}
                  href={`/login?next=${encodeURIComponent(currentPath)}`}
                  w="fit-content"
                >
                  Sign in or create an account
                </Button>
              </Stack>
            </Paper>
          ) : claim ? (
            <ClaimStatusPanel
              claim={claim}
              saving={saving}
              mfaChallengeId={mfaChallengeId}
              mfaCode={mfaCode}
              mfaSetupUrl={mfaSetupUrl}
              onMfaCodeChange={setMfaCode}
              onRefresh={refreshClaim}
              onVerify={verifyClaim}
              onCancel={cancelClaim}
              onStartMfa={startMfa}
              onConfirmMfa={confirmMfa}
            />
          ) : !requestType ? (
            <Paper withBorder radius="md" p="lg">
              <Stack gap="md">
                <div>
                  <Title order={2} size="h3">How can we help?</Title>
                  <Text c="dimmed">
                    This profile is already claimed. Ownership changes are reviewed; staff access is managed by the current organization owner.
                  </Text>
                </div>
                <Button
                  variant="light"
                  justify="space-between"
                  onClick={() => setRequestType('OWNERSHIP_TRANSFER')}
                >
                  Request ownership transfer
                </Button>
                <Button
                  color="orange"
                  variant="light"
                  justify="space-between"
                  onClick={() => setRequestType('OWNERSHIP_DISPUTE')}
                >
                  Report an ownership issue
                </Button>
                <Anchor component={Link} href={`/organizations/${encodeURIComponent(organizationId)}`}>
                  Return to organization profile
                </Anchor>
              </Stack>
            </Paper>
          ) : !method ? (
            <Paper withBorder radius="md" p="lg">
              <Stack gap="md">
                <div>
                  <Title order={2} size="h3">{requestTypeTitle(requestType)}</Title>
                  <Text c="dimmed">
                    {verificationMethodIntroduction(requestType)}
                  </Text>
                </div>
                <Radio.Group
                  value={selectedMethod}
                  onChange={(value) => setSelectedMethod(value as OrganizationClaimMethod)}
                  aria-label="Verification method"
                >
                  <Stack gap="sm">
                    {supportedMethods.map((entry) => (
                      <Paper
                        key={entry}
                        component="label"
                        withBorder
                        radius="md"
                        p="md"
                        className="cursor-pointer"
                      >
                        <Group align="flex-start" wrap="nowrap">
                          <Radio value={entry} mt={3} />
                          {methodIcon(entry)}
                          <div>
                            <Text fw={700}>{METHOD_LABELS[entry]}</Text>
                            <Text size="sm" c="dimmed">{METHOD_DESCRIPTIONS[entry]}</Text>
                          </div>
                        </Group>
                      </Paper>
                    ))}
                  </Stack>
                </Radio.Group>
                <Group justify="space-between">
                  {!presentation.claimable ? (
                    <Button variant="default" onClick={() => setRequestType(null)}>Back</Button>
                  ) : <span />}
                  <Button
                    disabled={!selectedMethod}
                    onClick={() => selectedMethod && setMethod(selectedMethod)}
                  >
                    Continue
                  </Button>
                </Group>
              </Stack>
            </Paper>
          ) : (
            <Paper component="form" withBorder radius="md" p="lg" onSubmit={handleCreate}>
              <Stack gap="md">
                <div>
                  <Group gap="xs">
                    {methodIcon(method)}
                    <Title order={2} size="h3">{METHOD_LABELS[method]}</Title>
                  </Group>
                  <Text c="dimmed" mt={4}>{METHOD_DESCRIPTIONS[method]}</Text>
                </div>

                {method === 'DOMAIN_EMAIL' ? (
                  <TextInput
                    label="Organization email"
                    description={presentation.displayDomain
                      ? `Use an address at ${presentation.displayDomain}.`
                      : 'Use an email address on the organization website domain.'}
                    type="email"
                    value={verificationEmail}
                    onChange={(event) => setVerificationEmail(event.currentTarget.value)}
                    required
                  />
                ) : null}

                {method === 'DNS_TXT' || method === 'HTML_META' ? (
                  <Alert color="blue">
                    We create the exact verification value after you submit. You can copy it without changing the public profile.
                  </Alert>
                ) : null}

                {needsRepresentativeDetails ? (
                  <>
                    <TextInput
                      label="Your role"
                      placeholder="Owner, director, board member, authorized representative"
                      value={roleTitle}
                      onChange={(event) => setRoleTitle(event.currentTarget.value)}
                      required
                    />
                    <Textarea
                      label="Why should you represent this organization?"
                      minRows={4}
                      value={explanation}
                      onChange={(event) => setExplanation(event.currentTarget.value)}
                      required
                    />
                    <TextInput
                      label="Public supporting evidence"
                      description="Optional public page showing your relationship to the organization."
                      type="url"
                      placeholder="https://"
                      value={publicEvidenceUrl}
                      onChange={(event) => setPublicEvidenceUrl(event.currentTarget.value)}
                    />
                  </>
                ) : null}

                {method === 'MANUAL_REVIEW' ? (
                  <>
                    <Title order={3} size="h5">Official contact for review</Title>
                    <Text size="sm" c="dimmed">
                      Optional, but useful when a board member, owner, or other official can confirm your role.
                    </Text>
                    <TextInput label="Contact name" value={officialContactName} onChange={(event) => setOfficialContactName(event.currentTarget.value)} />
                    <TextInput label="Contact email" type="email" value={officialContactEmail} onChange={(event) => setOfficialContactEmail(event.currentTarget.value)} />
                    <TextInput label="Contact phone" value={officialContactPhone} onChange={(event) => setOfficialContactPhone(event.currentTarget.value)} />
                    <TextInput label="Official contact page" type="url" placeholder="https://" value={officialContactUrl} onChange={(event) => setOfficialContactUrl(event.currentTarget.value)} />
                  </>
                ) : null}

                {requestType === 'OWNERSHIP_DISPUTE' ? (
                  <>
                    <Select
                      label="Ownership issue"
                      data={ISSUE_REASON_OPTIONS}
                      value={issueReason}
                      onChange={(value) => setIssueReason(value as OrganizationOwnershipIssueReason | null)}
                      required
                    />
                    <Select
                      label="Requested outcome"
                      data={OUTCOME_OPTIONS}
                      value={requestedOutcome}
                      onChange={(value) => setRequestedOutcome(value as OrganizationOwnershipRequestedOutcome | null)}
                      required
                    />
                    <Checkbox
                      checked={certified}
                      onChange={(event) => setCertified(event.currentTarget.checked)}
                      label="I certify that this report is accurate to the best of my knowledge and may be shared with the current owner during review."
                      required
                    />
                  </>
                ) : null}

                {requestType !== 'INITIAL_CLAIM' ? (
                  <Alert color="gray">
                    Submitting a transfer or dispute does not immediately change the current owner&apos;s access or the public claimed status.
                  </Alert>
                ) : null}
                <Group justify="space-between">
                  <Button variant="default" onClick={() => setMethod(null)}>Back</Button>
                  <Button type="submit" loading={saving}>
                    {requestType === 'OWNERSHIP_DISPUTE' ? 'Submit ownership report' : 'Start verification'}
                  </Button>
                </Group>
              </Stack>
            </Paper>
          )}
        </Stack>
      </Container>
    </>
  );
}

type ClaimStatusPanelProps = {
  claim: OrganizationClaim;
  saving: boolean;
  mfaChallengeId: string;
  mfaCode: string;
  mfaSetupUrl: string;
  onMfaCodeChange: (value: string) => void;
  onRefresh: () => void;
  onVerify: () => void;
  onCancel: () => void;
  onStartMfa: () => void;
  onConfirmMfa: (event: FormEvent) => void;
};

function ClaimStatusPanel({
  claim,
  saving,
  mfaChallengeId,
  mfaCode,
  mfaSetupUrl,
  onMfaCodeChange,
  onRefresh,
  onVerify,
  onCancel,
  onStartMfa,
  onConfirmMfa,
}: ClaimStatusPanelProps) {
  const evidence = claim.evidence[0] ?? null;
  const instructions = evidence?.instructions ?? {};

  if (claim.status === 'APPROVED') {
    return (
      <Paper withBorder radius="md" p="lg">
        <Stack gap="md">
          <CheckCircle2 size={34} className="text-emerald-600" />
          <Title order={2} size="h3">Organization ownership confirmed</Title>
          <Text c="dimmed">
            You can now manage the profile, invite staff, respond to reviews, and keep the organization information current.
          </Text>
          <Button component={Link} href={`/organizations/${encodeURIComponent(claim.organizationId)}`} w="fit-content">
            Open organization
          </Button>
        </Stack>
      </Paper>
    );
  }

  if (claim.status === 'APPROVED_PENDING_ACCEPTANCE') {
    return (
      <Paper withBorder radius="md" p="lg">
        <Stack gap="md">
          <Badge color="teal" variant="light" w="fit-content">Verification approved</Badge>
          <Title order={2} size="h3">Confirm ownership securely</Title>
          <Text c="dimmed">
            A final authenticator check protects the organization before ownership and management access change.
          </Text>
          {claim.userDecisionMessage ? (
            <Alert color="blue" title="Administrator decision">
              {claim.userDecisionMessage}
            </Alert>
          ) : null}
          {mfaSetupUrl ? (
            <Button component={Link} href={mfaSetupUrl} w="fit-content">Set up authenticator</Button>
          ) : mfaChallengeId ? (
            <form onSubmit={onConfirmMfa}>
              <Stack gap="sm">
                <TextInput
                  label="Authenticator code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={mfaCode}
                  onChange={(event) => onMfaCodeChange(event.currentTarget.value)}
                  maw={280}
                  required
                />
                <Button type="submit" loading={saving} w="fit-content">Confirm ownership</Button>
              </Stack>
            </form>
          ) : (
            <Button onClick={onStartMfa} loading={saving} w="fit-content">Continue securely</Button>
          )}
          <Button variant="subtle" color="gray" onClick={onCancel} disabled={saving} w="fit-content">
            Cancel request
          </Button>
        </Stack>
      </Paper>
    );
  }

  if (claim.status === 'PENDING_VERIFICATION') {
    return (
      <Paper withBorder radius="md" p="lg">
        <Stack gap="md">
          <Badge color="blue" variant="light" w="fit-content">Verification required</Badge>
          <Title order={2} size="h3">
            {claim.method === 'DOMAIN_EMAIL' ? 'Check your organization email' : 'Verify website control'}
          </Title>
          {claim.method === 'DOMAIN_EMAIL' ? (
            <Text c="dimmed">
              We sent a secure link to {claim.verificationEmail}. Sign in to the same BracketIQ account when opening it.
            </Text>
          ) : null}
          {claim.method === 'DNS_TXT' ? (
            <DnsVerificationInstruction
              hostname={instructions.dnsHostname}
              value={instructions.dnsValue}
            />
          ) : null}
          {claim.method === 'HTML_META' ? (
            <WebsiteMetaVerificationInstruction
              metaName={instructions.htmlMetaName}
              metaValue={instructions.htmlMetaValue}
            />
          ) : null}
          <Group>
            {claim.method === 'DNS_TXT' || claim.method === 'HTML_META' ? (
              <Button onClick={onVerify} loading={saving} leftSection={<ShieldCheck size={16} />}>
                {claim.method === 'DNS_TXT'
                  ? 'I added the DNS record — check again'
                  : 'I published the tag — check again'}
              </Button>
            ) : (
              <Button onClick={onRefresh} loading={saving} leftSection={<RefreshCw size={16} />}>
                Refresh status
              </Button>
            )}
            <Button variant="subtle" color="gray" onClick={onCancel} disabled={saving}>Cancel request</Button>
          </Group>
          {claim.expiresAt ? <Text size="xs" c="dimmed">Verification expires {new Date(claim.expiresAt).toLocaleString()}.</Text> : null}
        </Stack>
      </Paper>
    );
  }

  if (MANUAL_OR_REVIEW_STATUSES.has(claim.status)) {
    return (
      <Paper withBorder radius="md" p="lg">
        <Stack gap="md">
          <Badge color="yellow" variant="light" w="fit-content">Administrator review</Badge>
          <Title order={2} size="h3">
            {claim.requestType === 'OWNERSHIP_DISPUTE' ? 'Ownership issue submitted' : 'Request submitted for review'}
          </Title>
          <Text c="dimmed">
            BracketIQ will review your account, evidence, and the organization&apos;s public information. Claim and dispute notifications are sent to the default administrator.
          </Text>
          <Alert color="gray">
            The current owner&apos;s access and the public claimed status stay unchanged while the review is open.
          </Alert>
          <Group>
            <Button variant="light" onClick={onRefresh} loading={saving} leftSection={<RefreshCw size={16} />}>
              Refresh status
            </Button>
            <Button variant="subtle" color="gray" onClick={onCancel} disabled={saving}>Cancel request</Button>
          </Group>
        </Stack>
      </Paper>
    );
  }

  const terminalCopy = claim.status === 'REJECTED'
    ? claim.userDecisionMessage || 'This ownership request was not approved.'
    : claim.status === 'CANCELLED'
      ? 'This ownership request was cancelled.'
      : claim.status === 'EXPIRED'
        ? 'This ownership request expired before verification was completed.'
        : 'This ownership request is no longer active.';

  return (
    <Paper withBorder radius="md" p="lg">
      <Stack gap="md">
        <Badge color="gray" variant="light" w="fit-content">{claim.status.replace(/_/g, ' ')}</Badge>
        <Title order={2} size="h3">Claim request closed</Title>
        <Text c="dimmed">{terminalCopy}</Text>
        <Button component={Link} href={`/organizations/${encodeURIComponent(claim.organizationId)}`} variant="light" w="fit-content">
          Return to organization profile
        </Button>
      </Stack>
    </Paper>
  );
}

function CopyVerificationValue({
  label,
  value,
  copyLabel,
}: {
  label: string;
  value: string | undefined;
  copyLabel: string;
}) {
  const resolvedValue = value || '';

  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <Text size="xs" fw={700} c="dimmed">{label}</Text>
      <Text
        component="code"
        ff="monospace"
        className="mt-1 block break-all text-sm text-slate-950"
      >
        {resolvedValue || 'Loading verification value…'}
      </Text>
      <CopyButton value={resolvedValue} timeout={2000}>
        {({ copied, copy }) => (
          <Button
            mt="sm"
            size="xs"
            variant="light"
            onClick={copy}
            disabled={!resolvedValue}
            leftSection={copied ? <CheckCircle2 size={14} /> : <Copy size={14} />}
          >
            {copied ? 'Copied' : copyLabel}
          </Button>
        )}
      </CopyButton>
    </div>
  );
}

function CopyManagerInstructions({
  value,
  subject,
  question,
}: {
  value: string;
  subject: string;
  question: string;
}) {
  return (
    <div className="rounded-md border border-blue-200 bg-blue-50 p-3">
      <Text fw={700} size="sm">{question}</Text>
      <Text size="sm" c="dimmed" mt={4}>
        Copy a ready-to-send message with the exact technical instructions.
      </Text>
      <CopyButton value={value} timeout={2000}>
        {({ copied, copy }) => (
          <Button
            mt="sm"
            size="xs"
            variant="light"
            onClick={copy}
            leftSection={copied ? <CheckCircle2 size={14} /> : <Copy size={14} />}
          >
            {copied ? 'Instructions copied' : `Copy instructions for ${subject}`}
          </Button>
        )}
      </CopyButton>
    </div>
  );
}

function WebsiteMetaVerificationInstruction({
  metaName,
  metaValue,
}: {
  metaName: string | undefined;
  metaValue: string | undefined;
}) {
  const tag = metaName && metaValue
    ? `<meta name="${metaName}" content="${metaValue}" />`
    : undefined;
  const managerMessage = [
    'Please help me verify our website for BracketIQ.',
    '',
    'Add this exact tag inside the <head> section of the website homepage:',
    tag || '[verification tag is still loading]',
    '',
    'Publish the website after adding it. The tag is not visible to visitors.',
    'Please let me know when it is live so I can finish verification in BracketIQ.',
  ].join('\n');

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
      <Stack gap="md">
        <div>
          <Text fw={700}>Copy and publish this website tag</Text>
          <Text size="sm" c="dimmed" mt={4}>
            Paste the complete tag exactly as shown. You do not need to edit the name or value.
          </Text>
        </div>
        <CopyVerificationValue
          label="Complete tag"
          value={tag}
          copyLabel="Copy complete tag"
        />
        <div>
          <Text fw={700} size="sm" mb="xs">What to do</Text>
          <List type="ordered" size="sm" spacing="xs">
            <List.Item>
              Open your website builder or website administration area.
            </List.Item>
            <List.Item>
              Find Custom code, Header code, or Site verification settings.
            </List.Item>
            <List.Item>
              Paste the copied tag into the homepage <code>&lt;head&gt;</code> section.
            </List.Item>
            <List.Item>
              Save and publish the website, then return here and check again.
            </List.Item>
          </List>
          <Text size="xs" c="dimmed" mt="sm">
            The tag is not visible to website visitors. Keep it in place until BracketIQ confirms verification.
          </Text>
        </div>
        <CopyManagerInstructions
          value={managerMessage}
          subject="your website manager"
          question="Someone else manages your website?"
        />
      </Stack>
    </div>
  );
}

function DnsVerificationInstruction({
  hostname,
  value,
}: {
  hostname: string | undefined;
  value: string | undefined;
}) {
  const managerMessage = [
    'Please help me verify our domain for BracketIQ.',
    '',
    'Add this DNS record without changing or deleting any existing records:',
    'Type: TXT',
    `Name/Host: ${hostname || '[hostname is still loading]'}`,
    `Value/Content: ${value || '[verification value is still loading]'}`,
    'TTL: Auto or the provider default',
    '',
    'Please let me know when the record is saved so I can finish verification in BracketIQ.',
  ].join('\n');

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
      <Stack gap="md">
        <div>
          <Text fw={700}>Add this DNS verification record</Text>
          <Text size="sm" c="dimmed" mt={4}>
            Your domain provider will ask for a record type, name or host, and value or content.
          </Text>
        </div>
        <CopyVerificationValue label="Record type" value="TXT" copyLabel="Copy type" />
        <CopyVerificationValue label="Name / Host" value={hostname} copyLabel="Copy host" />
        <CopyVerificationValue label="Value / Content" value={value} copyLabel="Copy value" />
        <div>
          <Text fw={700} size="sm" mb="xs">What to do</Text>
          <List type="ordered" size="sm" spacing="xs">
            <List.Item>Sign in to the company where your domain or DNS is managed.</List.Item>
            <List.Item>Open DNS settings and choose Add record.</List.Item>
            <List.Item>Choose TXT and paste the copied host and value into the matching fields.</List.Item>
            <List.Item>Save the record, then return here and check again.</List.Item>
          </List>
          <Text size="xs" c="dimmed" mt="sm">
            DNS changes can take a few minutes to appear. Leave TTL set to Auto or the provider default.
          </Text>
        </div>
        <CopyManagerInstructions
          value={managerMessage}
          subject="your domain manager"
          question="Someone else manages your domain?"
        />
      </Stack>
    </div>
  );
}
