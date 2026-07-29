'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Anchor,
  Badge,
  Button,
  Divider,
  Group,
  Loader,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  Title,
  UnstyledButton,
} from '@mantine/core';
import { ExternalLink, RefreshCw, ShieldCheck } from 'lucide-react';

type ClaimStatus =
  | 'PENDING_VERIFICATION'
  | 'PENDING_MANUAL_REVIEW'
  | 'APPROVED_PENDING_ACCEPTANCE'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'DISPUTED'
  | 'REVOKED'
  | 'EXPIRED';
type ClaimMethod = 'DOMAIN_EMAIL' | 'DNS_TXT' | 'HTML_META' | 'MANUAL_REVIEW' | 'LEGACY_OWNER';
type ClaimRequestType =
  | 'INITIAL_CLAIM'
  | 'OWNERSHIP_TRANSFER'
  | 'OWNERSHIP_DISPUTE'
  | 'DUPLICATE_PROFILE_REVIEW';
type VerificationLevel = 'NONE' | 'AFFILIATION' | 'SITE_CONTROL' | 'MANUAL_REVIEW';
type ClaimDecisionAction = 'APPROVE' | 'REJECT' | 'MARK_DISPUTED' | 'RESOLVE' | 'REVOKE' | 'RESTORE';
type OwnershipResolution =
  | 'UPHOLD_CURRENT_OWNER'
  | 'INITIATE_OWNERSHIP_TRANSFER'
  | 'REVOKE_TO_UNCLAIMED'
  | 'SUSPEND_OWNER_ACCESS'
  | 'MERGE_OR_CORRECT_PROFILE';

type AdminAccountSummary = {
  id: string;
  name: string | null;
  email: string | null;
  emailVerifiedAt?: string | null;
};

type AdminClaimListRow = {
  id: string;
  organizationId: string;
  claimantUserId: string;
  requestType: ClaimRequestType;
  status: ClaimStatus;
  method: ClaimMethod;
  verificationLevel: VerificationLevel;
  roleTitle: string | null;
  issueReason: string | null;
  requestedOutcome: string | null;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
  organization: {
    id: string;
    name: string;
    ownershipStatus: string;
  } | null;
  claimant: AdminAccountSummary | null;
};

type AdminClaimDetail = {
  claim: AdminClaimListRow & {
    verificationEmail?: string | null;
    verificationEmailDomain?: string | null;
    explanation?: string | null;
    publicEvidenceUrl?: string | null;
    officialContactName?: string | null;
    officialContactEmail?: string | null;
    officialContactPhone?: string | null;
    officialContactUrl?: string | null;
    expiresAt?: string | null;
    decidedAt?: string | null;
    internalDecisionNotes?: string | null;
    userDecisionMessage?: string | null;
    resolution?: OwnershipResolution | null;
    currentOwnerResponseDueAt?: string | null;
    currentOwnerRespondedAt?: string | null;
    currentOwnerResponse?: string | null;
    currentOwnerPublicEvidenceUrl?: string | null;
    currentOwnerApprovedAt?: string | null;
    certifiedAt?: string | null;
  };
  organization: {
    id: string;
    name: string;
    ownerId: string;
    website: string | null;
    originType: string;
    ownershipStatus: string;
    claimVerificationLevel: string;
  } | null;
  domains: Array<{
    id: string;
    host: string;
    registrableDomain: string;
    isPrimary: boolean;
    isSharedPlatform: boolean;
    verifiedAt: string | null;
  }>;
  evidence: Array<{
    id: string;
    method: ClaimMethod;
    status: string;
    expiresAt: string | null;
    verifiedAt: string | null;
    lastCheckedAt: string | null;
    failureReason: string | null;
  }>;
  events: Array<{
    id: string;
    eventType: string;
    actorUserId: string | null;
    createdAt: string;
  }>;
  claimant: AdminAccountSummary | null;
  currentOwner?: AdminAccountSummary | null;
  staff: Array<{ userId: string; types: string[]; roleId: string | null }>;
  reviewedBy: string;
};

type AdminOrganizationClaimsPanelProps = {
  active: boolean;
  refreshKey: number;
  onTotalChange?: (total: number) => void;
};

const PAGE_SIZE = 25;

const STATUS_OPTIONS = [
  { value: 'NEEDS_REVIEW', label: 'Needs review' },
  { value: 'ALL', label: 'All statuses' },
  { value: 'PENDING_VERIFICATION', label: 'Pending verification' },
  { value: 'PENDING_MANUAL_REVIEW', label: 'Pending manual review' },
  { value: 'APPROVED_PENDING_ACCEPTANCE', label: 'Approved, awaiting MFA' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'DISPUTED', label: 'Disputed' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'REVOKED', label: 'Revoked' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'EXPIRED', label: 'Expired' },
];

const METHOD_OPTIONS = [
  { value: 'ALL', label: 'All methods' },
  { value: 'DOMAIN_EMAIL', label: 'Domain email' },
  { value: 'DNS_TXT', label: 'DNS record' },
  { value: 'HTML_META', label: 'Website meta tag' },
  { value: 'MANUAL_REVIEW', label: 'Manual review' },
  { value: 'LEGACY_OWNER', label: 'Legacy owner' },
];

const REQUEST_TYPE_OPTIONS = [
  { value: 'ALL', label: 'All request types' },
  { value: 'INITIAL_CLAIM', label: 'Initial claim' },
  { value: 'OWNERSHIP_TRANSFER', label: 'Ownership transfer' },
  { value: 'OWNERSHIP_DISPUTE', label: 'Ownership dispute' },
  { value: 'DUPLICATE_PROFILE_REVIEW', label: 'Duplicate profile review' },
];

const VERIFICATION_LEVEL_OPTIONS = [
  { value: 'MANUAL_REVIEW', label: 'Manual review' },
  { value: 'AFFILIATION', label: 'Organization affiliation' },
  { value: 'SITE_CONTROL', label: 'Website control' },
  { value: 'NONE', label: 'No verification' },
];

const RESOLUTION_OPTIONS: Array<{ value: OwnershipResolution; label: string }> = [
  { value: 'UPHOLD_CURRENT_OWNER', label: 'Uphold current owner' },
  { value: 'INITIATE_OWNERSHIP_TRANSFER', label: 'Initiate ownership transfer' },
  { value: 'REVOKE_TO_UNCLAIMED', label: 'Revoke to unclaimed' },
  { value: 'SUSPEND_OWNER_ACCESS', label: 'Suspend owner access' },
  { value: 'MERGE_OR_CORRECT_PROFILE', label: 'Merge or correct profile' },
];

const labelFor = (value: string | null | undefined): string => (
  value
    ? value
        .toLowerCase()
        .split('_')
        .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
        .join(' ')
    : 'Not provided'
);

const formatDate = (value: string | null | undefined): string => {
  if (!value) return 'Not set';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

const statusColor = (status: ClaimStatus): string => {
  if (status === 'APPROVED') return 'green';
  if (status === 'APPROVED_PENDING_ACCEPTANCE') return 'teal';
  if (status === 'DISPUTED' || status === 'REVOKED') return 'red';
  if (status === 'REJECTED' || status === 'CANCELLED' || status === 'EXPIRED') return 'gray';
  return 'yellow';
};

const decisionOptionsFor = (
  claim: AdminClaimDetail['claim'],
): Array<{ value: ClaimDecisionAction; label: string }> => {
  if (claim.status === 'APPROVED' || claim.status === 'APPROVED_PENDING_ACCEPTANCE') {
    return [{ value: 'REVOKE', label: 'Revoke approval' }];
  }
  if (
    (claim.status === 'REVOKED' || claim.status === 'REJECTED')
    && claim.requestType === 'INITIAL_CLAIM'
  ) {
    return [{ value: 'RESTORE', label: 'Restore for claimant acceptance' }];
  }
  if (claim.status === 'DISPUTED') {
    return [{ value: 'RESOLVE', label: 'Resolve dispute' }];
  }
  if (
    claim.requestType === 'OWNERSHIP_DISPUTE'
    || claim.requestType === 'OWNERSHIP_TRANSFER'
    || claim.requestType === 'DUPLICATE_PROFILE_REVIEW'
  ) {
    return [
      { value: 'MARK_DISPUTED', label: 'Mark credible and open dispute' },
      { value: 'REJECT', label: 'Reject request' },
    ];
  }
  if (
    claim.status === 'PENDING_MANUAL_REVIEW'
    || claim.status === 'PENDING_VERIFICATION'
  ) {
    return [
      { value: 'APPROVE', label: 'Approve claim' },
      { value: 'REJECT', label: 'Reject claim' },
    ];
  }
  return [];
};

const resolutionOptionsFor = (
  requestType: ClaimRequestType,
): Array<{ value: OwnershipResolution; label: string }> => {
  if (requestType === 'DUPLICATE_PROFILE_REVIEW') {
    return RESOLUTION_OPTIONS.filter((option) => (
      option.value === 'UPHOLD_CURRENT_OWNER'
      || option.value === 'REVOKE_TO_UNCLAIMED'
      || option.value === 'MERGE_OR_CORRECT_PROFILE'
    ));
  }
  if (requestType === 'OWNERSHIP_TRANSFER') {
    return RESOLUTION_OPTIONS.filter((option) => (
      option.value === 'UPHOLD_CURRENT_OWNER'
      || option.value === 'INITIATE_OWNERSHIP_TRANSFER'
    ));
  }
  return RESOLUTION_OPTIONS;
};

const needsConfirmation = (
  action: ClaimDecisionAction,
  resolution: OwnershipResolution | null,
): boolean => (
  action === 'REVOKE'
  || resolution === 'REVOKE_TO_UNCLAIMED'
  || resolution === 'SUSPEND_OWNER_ACCESS'
  || resolution === 'INITIATE_OWNERSHIP_TRANSFER'
);

const accountLabel = (account: AdminAccountSummary | null | undefined): string => {
  if (!account) return 'Account not found';
  return account.name?.trim() || account.email?.trim() || account.id;
};

export default function AdminOrganizationClaimsPanel({
  active,
  refreshKey,
  onTotalChange,
}: AdminOrganizationClaimsPanelProps) {
  const [claims, setClaims] = useState<AdminClaimListRow[]>([]);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState('NEEDS_REVIEW');
  const [methodFilter, setMethodFilter] = useState('ALL');
  const [requestTypeFilter, setRequestTypeFilter] = useState('ALL');
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminClaimDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [decisionAction, setDecisionAction] = useState<ClaimDecisionAction | null>(null);
  const [verificationLevel, setVerificationLevel] = useState<VerificationLevel>('MANUAL_REVIEW');
  const [resolution, setResolution] = useState<OwnershipResolution | null>(null);
  const [userDecisionMessage, setUserDecisionMessage] = useState('');
  const [internalDecisionNotes, setInternalDecisionNotes] = useState('');

  const loadClaims = useCallback(async (nextPage: number) => {
    if (!active) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(nextPage),
        pageSize: String(PAGE_SIZE),
      });
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (methodFilter !== 'ALL') params.set('method', methodFilter);
      if (requestTypeFilter !== 'ALL') params.set('requestType', requestTypeFilter);
      const response = await fetch(`/api/admin/organization-claims?${params.toString()}`, {
        credentials: 'include',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'Unable to load organization claims.');
      const nextClaims = Array.isArray(payload.claims) ? payload.claims as AdminClaimListRow[] : [];
      const nextTotal = Number(payload.pagination?.total ?? 0);
      setClaims(nextClaims);
      setPage(Number(payload.pagination?.page ?? nextPage));
      setPageCount(Number(payload.pagination?.pageCount ?? 0));
      setTotal(nextTotal);
      onTotalChange?.(nextTotal);
      setSelectedClaimId((current) => (
        current && nextClaims.some((claim) => claim.id === current)
          ? current
          : nextClaims[0]?.id ?? null
      ));
      if (nextClaims.length === 0) setDetail(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load organization claims.');
    } finally {
      setLoading(false);
    }
  }, [active, methodFilter, onTotalChange, requestTypeFilter, statusFilter]);

  useEffect(() => {
    if (!active) return;
    void loadClaims(1);
  }, [active, loadClaims, refreshKey]);

  useEffect(() => {
    if (!active || !selectedClaimId) {
      setDetail(null);
      return undefined;
    }
    const abortController = new AbortController();
    setDetailLoading(true);
    setDetailError(null);
    void fetch(`/api/admin/organization-claims/${encodeURIComponent(selectedClaimId)}`, {
      credentials: 'include',
      signal: abortController.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload?.error || 'Unable to load claim details.');
        setDetail(payload as AdminClaimDetail);
      })
      .catch((loadError) => {
        if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
        setDetailError(loadError instanceof Error ? loadError.message : 'Unable to load claim details.');
      })
      .finally(() => {
        if (!abortController.signal.aborted) setDetailLoading(false);
      });
    return () => abortController.abort();
  }, [active, selectedClaimId]);

  const decisionOptions = useMemo(
    () => detail ? decisionOptionsFor(detail.claim) : [],
    [detail],
  );
  const resolutionOptions = useMemo(
    () => detail ? resolutionOptionsFor(detail.claim.requestType) : [],
    [detail],
  );

  useEffect(() => {
    setDecisionAction(decisionOptions[0]?.value ?? null);
    setResolution(null);
    setVerificationLevel(
      detail?.claim.verificationLevel && detail.claim.verificationLevel !== 'NONE'
        ? detail.claim.verificationLevel
        : 'MANUAL_REVIEW',
    );
    setUserDecisionMessage('');
    setInternalDecisionNotes(detail?.claim.internalDecisionNotes ?? '');
    setNotice(null);
  }, [decisionOptions, detail?.claim.id, detail?.claim.internalDecisionNotes, detail?.claim.verificationLevel]);

  const submitDecision = async () => {
    if (!detail || !decisionAction) return;
    const normalizedMessage = userDecisionMessage.trim();
    if (!normalizedMessage) {
      setDetailError('Enter the claimant-facing decision message before saving.');
      return;
    }
    if (decisionAction === 'RESOLVE' && !resolution) {
      setDetailError('Choose a dispute resolution before saving.');
      return;
    }
    if (
      needsConfirmation(decisionAction, resolution)
      && !window.confirm('This decision can change organization ownership or access. Continue?')
    ) {
      return;
    }
    setSaving(true);
    setDetailError(null);
    setNotice(null);
    try {
      const response = await fetch(
        `/api/admin/organization-claims/${encodeURIComponent(detail.claim.id)}`,
        {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: decisionAction,
            verificationLevel,
            userDecisionMessage: normalizedMessage,
            internalDecisionNotes: internalDecisionNotes.trim() || null,
            resolution: decisionAction === 'RESOLVE' ? resolution : null,
          }),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'Unable to save the claim decision.');
      setNotice('Decision saved and added to the claim audit trail.');
      await loadClaims(page);
    } catch (saveError) {
      setDetailError(saveError instanceof Error ? saveError.message : 'Unable to save the claim decision.');
    } finally {
      setSaving(false);
    }
  };

  const selectedClaim = claims.find((claim) => claim.id === selectedClaimId) ?? null;

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={3}>Organization claims</Title>
          <Text size="sm" c="dimmed">
            Review manual claims, ownership disputes, transfers, and corrective profile requests.
          </Text>
        </div>
        <Button
          variant="light"
          leftSection={<RefreshCw size={16} />}
          loading={loading}
          onClick={() => void loadClaims(page)}
        >
          Refresh
        </Button>
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        <Select
          label="Status"
          data={STATUS_OPTIONS}
          value={statusFilter}
          onChange={(value) => {
            setStatusFilter(value ?? 'NEEDS_REVIEW');
            setPage(1);
          }}
        />
        <Select
          label="Verification method"
          data={METHOD_OPTIONS}
          value={methodFilter}
          onChange={(value) => {
            setMethodFilter(value ?? 'ALL');
            setPage(1);
          }}
        />
        <Select
          label="Request type"
          data={REQUEST_TYPE_OPTIONS}
          value={requestTypeFilter}
          onChange={(value) => {
            setRequestTypeFilter(value ?? 'ALL');
            setPage(1);
          }}
        />
      </SimpleGrid>

      {error ? <Alert color="red">{error}</Alert> : null}
      {notice ? <Alert color="green">{notice}</Alert> : null}

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md" verticalSpacing="md">
        <Paper withBorder p="md" radius="md">
          <Group justify="space-between" mb="sm">
            <Text fw={700}>Review queue</Text>
            <Badge variant="light">{total}</Badge>
          </Group>
          {loading && claims.length === 0 ? (
            <Group justify="center" py="xl"><Loader size="sm" /></Group>
          ) : claims.length === 0 ? (
            <Text c="dimmed" size="sm">No claims match these filters.</Text>
          ) : (
            <Stack gap="xs">
              {claims.map((claim) => {
                const selected = claim.id === selectedClaimId;
                return (
                  <UnstyledButton
                    key={claim.id}
                    aria-label={`Review ${claim.organization?.name ?? claim.organizationId}`}
                    onClick={() => setSelectedClaimId(claim.id)}
                    p="sm"
                    style={{
                      border: `1px solid var(${selected ? '--mantine-color-blue-5' : '--mantine-color-gray-3'})`,
                      borderRadius: 'var(--mantine-radius-md)',
                      background: selected ? 'var(--mantine-color-blue-light)' : undefined,
                    }}
                  >
                    <Group justify="space-between" align="flex-start" wrap="nowrap">
                      <div>
                        <Text fw={700} lineClamp={1}>
                          {claim.organization?.name ?? claim.organizationId}
                        </Text>
                        <Text size="sm" c="dimmed" lineClamp={1}>
                          {accountLabel(claim.claimant)}
                        </Text>
                      </div>
                      <Badge color={statusColor(claim.status)} variant="light" size="sm">
                        {labelFor(claim.status)}
                      </Badge>
                    </Group>
                    <Group gap="xs" mt="xs">
                      <Badge variant="outline" color="gray">{labelFor(claim.requestType)}</Badge>
                      <Badge variant="outline" color="gray">{labelFor(claim.method)}</Badge>
                    </Group>
                    <Text size="xs" c="dimmed" mt="xs">{formatDate(claim.createdAt)}</Text>
                  </UnstyledButton>
                );
              })}
            </Stack>
          )}
          <Group justify="space-between" mt="md">
            <Button
              variant="default"
              size="xs"
              disabled={page <= 1 || loading}
              onClick={() => {
                const nextPage = page - 1;
                setPage(nextPage);
                void loadClaims(nextPage);
              }}
            >
              Previous
            </Button>
            <Text size="sm" c="dimmed">
              Page {pageCount === 0 ? 0 : page} of {pageCount}
            </Text>
            <Button
              variant="default"
              size="xs"
              disabled={page >= pageCount || loading}
              onClick={() => {
                const nextPage = page + 1;
                setPage(nextPage);
                void loadClaims(nextPage);
              }}
            >
              Next
            </Button>
          </Group>
        </Paper>

        <Paper withBorder p="md" radius="md">
          {detailLoading ? (
            <Group justify="center" py="xl"><Loader size="sm" /></Group>
          ) : detailError && !detail ? (
            <Alert color="red">{detailError}</Alert>
          ) : !detail || !selectedClaim ? (
            <Text c="dimmed" size="sm">Select a claim to review its evidence and history.</Text>
          ) : (
            <Stack gap="md">
              <Group justify="space-between" align="flex-start">
                <div>
                  <Title order={4}>{detail.organization?.name ?? selectedClaim.organizationId}</Title>
                  <Text size="sm" c="dimmed">
                    {labelFor(detail.claim.requestType)} · {labelFor(detail.claim.method)}
                  </Text>
                </div>
                <Badge color={statusColor(detail.claim.status)} variant="light">
                  {labelFor(detail.claim.status)}
                </Badge>
              </Group>

              <Group gap="xs">
                <Button
                  component={Link}
                  href={`/organizations/${encodeURIComponent(detail.claim.organizationId)}`}
                  target="_blank"
                  variant="default"
                  size="xs"
                  leftSection={<ExternalLink size={14} />}
                >
                  Open organization
                </Button>
                {detail.organization?.website ? (
                  <Button
                    component="a"
                    href={detail.organization.website}
                    target="_blank"
                    rel="noreferrer"
                    variant="default"
                    size="xs"
                    leftSection={<ExternalLink size={14} />}
                  >
                    Official website
                  </Button>
                ) : null}
              </Group>

              <Divider />

              <SimpleGrid cols={{ base: 1, sm: 2 }}>
                <div>
                  <Text size="xs" c="dimmed">Claimant</Text>
                  <Text fw={600}>{accountLabel(detail.claimant)}</Text>
                  <Text size="sm">{detail.claimant?.email ?? detail.claim.claimantUserId}</Text>
                  <Text size="xs" c="dimmed">
                    Account email {detail.claimant?.emailVerifiedAt ? 'verified' : 'not verified'}
                  </Text>
                </div>
                <div>
                  <Text size="xs" c="dimmed">Current owner</Text>
                  <Text fw={600}>{accountLabel(detail.currentOwner)}</Text>
                  <Text size="sm">{detail.currentOwner?.email ?? detail.organization?.ownerId ?? 'Not found'}</Text>
                </div>
              </SimpleGrid>

              <SimpleGrid cols={{ base: 1, sm: 2 }}>
                <div>
                  <Text size="xs" c="dimmed">Role</Text>
                  <Text size="sm">{detail.claim.roleTitle || 'Not provided'}</Text>
                </div>
                <div>
                  <Text size="xs" c="dimmed">Verification address</Text>
                  <Text size="sm">{detail.claim.verificationEmail || 'Not provided'}</Text>
                </div>
                <div>
                  <Text size="xs" c="dimmed">Issue</Text>
                  <Text size="sm">{labelFor(detail.claim.issueReason)}</Text>
                </div>
                <div>
                  <Text size="xs" c="dimmed">Requested outcome</Text>
                  <Text size="sm">{labelFor(detail.claim.requestedOutcome)}</Text>
                </div>
              </SimpleGrid>

              {detail.claim.explanation ? (
                <div>
                  <Text size="xs" c="dimmed">Claimant explanation</Text>
                  <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>{detail.claim.explanation}</Text>
                </div>
              ) : null}
              {detail.claim.publicEvidenceUrl ? (
                <Anchor href={detail.claim.publicEvidenceUrl} target="_blank" rel="noreferrer" size="sm">
                  Open claimant public evidence
                </Anchor>
              ) : null}

              {detail.claim.currentOwnerResponse ? (
                <Alert color="blue" title="Current owner response">
                  <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                    {detail.claim.currentOwnerResponse}
                  </Text>
                  {detail.claim.currentOwnerPublicEvidenceUrl ? (
                    <Anchor href={detail.claim.currentOwnerPublicEvidenceUrl} target="_blank" rel="noreferrer" size="sm">
                      Open owner evidence
                    </Anchor>
                  ) : null}
                </Alert>
              ) : null}

              <div>
                <Text fw={700} size="sm" mb={4}>Domain and verification evidence</Text>
                <Stack gap={4}>
                  {detail.domains.map((domain) => (
                    <Group key={domain.id} gap="xs">
                      <Text size="sm">{domain.host}</Text>
                      {domain.isPrimary ? <Badge size="xs">Primary</Badge> : null}
                      {domain.isSharedPlatform ? <Badge size="xs" color="orange">Shared platform</Badge> : null}
                      {domain.verifiedAt ? <Badge size="xs" color="green">Verified</Badge> : null}
                    </Group>
                  ))}
                  {detail.evidence.map((evidence) => (
                    <Group key={evidence.id} gap="xs">
                      <ShieldCheck size={14} />
                      <Text size="sm">{labelFor(evidence.method)}</Text>
                      <Badge
                        size="xs"
                        color={evidence.status === 'VERIFIED' ? 'green' : evidence.status === 'FAILED' ? 'red' : 'yellow'}
                      >
                        {labelFor(evidence.status)}
                      </Badge>
                      <Text size="xs" c="dimmed">
                        checked {formatDate(evidence.lastCheckedAt)}
                      </Text>
                    </Group>
                  ))}
                  {detail.domains.length === 0 && detail.evidence.length === 0 ? (
                    <Text size="sm" c="dimmed">No domain or automatic evidence is attached.</Text>
                  ) : null}
                </Stack>
              </div>

              <div>
                <Text fw={700} size="sm" mb={4}>Audit history</Text>
                <Stack gap={2}>
                  {detail.events.slice(-8).reverse().map((event) => (
                    <Group key={event.id} justify="space-between" wrap="nowrap">
                      <Text size="sm">{labelFor(event.eventType)}</Text>
                      <Text size="xs" c="dimmed">{formatDate(event.createdAt)}</Text>
                    </Group>
                  ))}
                  {detail.events.length === 0 ? (
                    <Text size="sm" c="dimmed">No audit events recorded.</Text>
                  ) : null}
                </Stack>
              </div>

              {detailError ? <Alert color="red">{detailError}</Alert> : null}

              {decisionOptions.length > 0 ? (
                <>
                  <Divider />
                  <Title order={5}>Administrator decision</Title>
                  <Select
                    label="Action"
                    data={decisionOptions}
                    value={decisionAction}
                    onChange={(value) => setDecisionAction(value as ClaimDecisionAction | null)}
                  />
                  {decisionAction === 'RESOLVE' ? (
                    <Select
                      label="Resolution"
                      data={resolutionOptions}
                      value={resolution}
                      onChange={(value) => setResolution(value as OwnershipResolution | null)}
                      required
                    />
                  ) : null}
                  {decisionAction === 'APPROVE' || decisionAction === 'RESTORE' ? (
                    <Select
                      label="Verification level"
                      data={VERIFICATION_LEVEL_OPTIONS}
                      value={verificationLevel}
                      onChange={(value) => setVerificationLevel((value as VerificationLevel | null) ?? 'MANUAL_REVIEW')}
                    />
                  ) : null}
                  <Textarea
                    label="Message to claimant"
                    description="Required. Explain the decision and any next step without including internal evidence."
                    minRows={3}
                    maxLength={2000}
                    value={userDecisionMessage}
                    onChange={(event) => setUserDecisionMessage(event.currentTarget.value)}
                    required
                  />
                  <Textarea
                    label="Internal decision notes"
                    description="Visible only to Razumly administrators."
                    minRows={3}
                    maxLength={4000}
                    value={internalDecisionNotes}
                    onChange={(event) => setInternalDecisionNotes(event.currentTarget.value)}
                  />
                  <Button
                    onClick={() => void submitDecision()}
                    loading={saving}
                    disabled={!decisionAction}
                  >
                    Save decision
                  </Button>
                </>
              ) : (
                <Alert color="gray">
                  This claim has no administrator action available in its current state.
                </Alert>
              )}
            </Stack>
          )}
        </Paper>
      </SimpleGrid>
    </Stack>
  );
}
