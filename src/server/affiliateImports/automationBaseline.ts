import { createHash } from 'crypto';
import type { AffiliateCandidateInput } from './types';

export const AFFILIATE_AUTOMATION_BASELINE_METADATA_KEY = 'automationBaseline';
export const AFFILIATE_AUTOMATION_REVIEW_METADATA_KEY = 'automationReviewRequired';

export type AffiliateAutomationCandidateShape = Pick<
  AffiliateCandidateInput,
  | 'listingKind'
  | 'title'
  | 'officialActionUrl'
  | 'sourceUrl'
  | 'startsAt'
  | 'dateDisplayMode'
  | 'city'
  | 'venueName'
  | 'address'
  | 'priceText'
>;

export type AffiliateAutomationBaseline = {
  schemaVersion: 1;
  mappingId: string;
  mappingVersion: number;
  approvedAt: string;
  candidateCount: number;
  rejectedCount: number;
  listingKinds: string[];
  criticalMissingCount: number;
  criticalMissingRate: number;
  normalizedFieldsHash: string;
};

export type AffiliateAutomationRunMetrics = Omit<
  AffiliateAutomationBaseline,
  'schemaVersion' | 'mappingId' | 'mappingVersion' | 'approvedAt'
>;

const normalizedText = (value: unknown): string => (
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').toLowerCase() : ''
);

const normalizedKind = (value: unknown): string => normalizedText(value).toUpperCase();

const hasLocation = (candidate: AffiliateAutomationCandidateShape): boolean => Boolean(
  normalizedText(candidate.address)
  || normalizedText(candidate.venueName)
  || normalizedText(candidate.city)
);

const hasRequiredDate = (candidate: AffiliateAutomationCandidateShape): boolean => {
  const kind = normalizedKind(candidate.listingKind);
  if (kind === 'RENTAL' || kind === 'CLUB') return true;
  if (normalizedText(candidate.dateDisplayMode) && normalizedText(candidate.dateDisplayMode) !== 'scheduled') {
    return true;
  }
  return Boolean(normalizedText(candidate.startsAt));
};

const isMissingCriticalData = (candidate: AffiliateAutomationCandidateShape): boolean => (
  !normalizedText(candidate.officialActionUrl)
  || !hasRequiredDate(candidate)
  || !hasLocation(candidate)
);

const normalizedCandidateRow = (candidate: AffiliateAutomationCandidateShape): string => [
  normalizedKind(candidate.listingKind),
  normalizedText(candidate.title),
  normalizedText(candidate.officialActionUrl),
  normalizedText(candidate.sourceUrl),
  normalizedText(candidate.startsAt),
  normalizedText(candidate.dateDisplayMode),
  normalizedText(candidate.address || candidate.venueName || candidate.city),
  normalizedText(candidate.priceText),
].join('|');

export const calculateAffiliateAutomationRunMetrics = (
  candidates: AffiliateAutomationCandidateShape[],
  rejectedCount = 0,
): AffiliateAutomationRunMetrics => {
  const criticalMissingCount = candidates.filter(isMissingCriticalData).length;
  const normalizedRows = candidates.map(normalizedCandidateRow).sort();
  return {
    candidateCount: candidates.length,
    rejectedCount: Math.max(0, Math.trunc(rejectedCount)),
    listingKinds: Array.from(new Set(candidates.map((candidate) => normalizedKind(candidate.listingKind))))
      .filter(Boolean)
      .sort(),
    criticalMissingCount,
    criticalMissingRate: candidates.length ? criticalMissingCount / candidates.length : 0,
    normalizedFieldsHash: createHash('sha256').update(normalizedRows.join('\n')).digest('hex'),
  };
};

export const buildAffiliateAutomationBaseline = (params: {
  mappingId: string;
  mappingVersion: number;
  approvedAt: Date;
  candidates: AffiliateAutomationCandidateShape[];
  rejectedCount?: number;
}): AffiliateAutomationBaseline => ({
  schemaVersion: 1,
  mappingId: params.mappingId,
  mappingVersion: params.mappingVersion,
  approvedAt: params.approvedAt.toISOString(),
  ...calculateAffiliateAutomationRunMetrics(params.candidates, params.rejectedCount),
});

export const parseAffiliateAutomationBaseline = (value: unknown): AffiliateAutomationBaseline | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    row.schemaVersion !== 1
    || typeof row.mappingId !== 'string'
    || typeof row.mappingVersion !== 'number'
    || typeof row.approvedAt !== 'string'
    || typeof row.candidateCount !== 'number'
    || typeof row.rejectedCount !== 'number'
    || !Array.isArray(row.listingKinds)
    || typeof row.criticalMissingCount !== 'number'
    || typeof row.criticalMissingRate !== 'number'
    || typeof row.normalizedFieldsHash !== 'string'
  ) {
    return null;
  }
  return row as AffiliateAutomationBaseline;
};

export const affiliateAutomationDriftReasons = (
  baseline: AffiliateAutomationBaseline | null,
  current: AffiliateAutomationRunMetrics,
): string[] => {
  if (!baseline) return ['Automatic import baseline is missing.'];

  const reasons: string[] = [];
  if (baseline.candidateCount > 0 && current.candidateCount === 0) {
    reasons.push('Candidate count fell from a nonzero baseline to zero.');
  }
  if (
    baseline.candidateCount > 0
    && current.candidateCount > baseline.candidateCount * 2
    && current.candidateCount >= baseline.candidateCount + 5
  ) {
    reasons.push(`Candidate count increased from ${baseline.candidateCount} to ${current.candidateCount}.`);
  }
  if (current.candidateCount > 0 && current.criticalMissingRate > 0.25) {
    reasons.push(`${Math.round(current.criticalMissingRate * 100)}% of candidates are missing critical URL, date, or location data.`);
  }
  if (baseline.listingKinds.join('|') !== current.listingKinds.join('|')) {
    reasons.push(`Listing kinds changed from ${baseline.listingKinds.join(', ') || 'none'} to ${current.listingKinds.join(', ') || 'none'}.`);
  }
  const totalRows = current.candidateCount + current.rejectedCount;
  if (totalRows > 0 && current.rejectedCount / totalRows > 0.5) {
    reasons.push(`${Math.round((current.rejectedCount / totalRows) * 100)}% of extracted rows were rejected.`);
  }
  return reasons;
};
