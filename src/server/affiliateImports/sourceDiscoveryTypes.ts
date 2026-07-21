import { z } from 'zod';

export const AFFILIATE_DISCOVERY_CAMPAIGN_STATUSES = ['ACTIVE', 'PAUSED', 'ARCHIVED'] as const;
export const AFFILIATE_DISCOVERY_RUN_STATUSES = ['QUEUED', 'RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED'] as const;
export const AFFILIATE_DISCOVERY_RESULT_STATUSES = [
  'NEW',
  'INTAKE_CREATED',
  'REVIEW_REQUIRED',
  'DUPLICATE',
  'REJECTED',
  'BLOCKED',
] as const;
export const AFFILIATE_DOMAIN_POLICY_STATUSES = ['NEEDS_REVIEW', 'ALLOWED', 'BLOCKED'] as const;
export const AFFILIATE_MAPPING_JOB_STATUSES = ['QUEUED', 'CLAIMED', 'REVIEW_REQUIRED', 'APPROVED', 'FAILED'] as const;
export const AFFILIATE_DISCOVERY_SOURCE_TYPES = [
  'CLUB',
  'TRYOUT',
  'EVENT',
  'LEAGUE',
  'TOURNAMENT',
  'CAMP',
  'CLINIC',
  'OPEN_PLAY',
  'RENTAL',
  'DIRECTORY',
] as const;

export const affiliateSourceDiscoveryCampaignSchema = z.object({
  name: z.string().trim().min(2).max(160),
  region: z.string().trim().min(2).max(200),
  location: z.string().trim().max(200).nullable().optional(),
  sportIds: z.array(z.string().trim().min(1)).min(1).max(50),
  sourceTypeHints: z.array(z.enum(AFFILIATE_DISCOVERY_SOURCE_TYPES)).min(1).max(10),
  status: z.enum(AFFILIATE_DISCOVERY_CAMPAIGN_STATUSES).default('PAUSED'),
  autoCreateIntakes: z.boolean().default(true),
  searchIntervalMinutes: z.number().int().min(1440).max(525_600).default(10_080),
  maxQueriesPerRun: z.number().int().min(1).max(50).default(10),
  maxResultsPerQuery: z.number().int().min(1).max(20).default(10),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

export type AffiliateSourceDiscoveryCampaignInput = z.input<typeof affiliateSourceDiscoveryCampaignSchema>;
export type ValidatedAffiliateSourceDiscoveryCampaignInput = z.output<typeof affiliateSourceDiscoveryCampaignSchema>;

export type AffiliateSourceDiscoveryCampaignForRules = {
  id?: string;
  region: string;
  location?: string | null;
  sourceTypeHints: string[];
  maxQueriesPerRun: number;
};

export type AffiliateSourceDiscoveryQuery = {
  query: string;
  sportId: string | null;
  sportName: string | null;
  sourceType: string;
  templateKey: string;
};

export type AffiliateSourceDiscoveryEvaluationInput = {
  url: string;
  title?: string | null;
  description?: string | null;
  query: AffiliateSourceDiscoveryQuery;
  campaignRegion: string;
  selectedSports: Array<{ id: string; name: string }>;
  currentYear?: number;
};

export type AffiliateSourceDiscoveryEvaluation = {
  canonicalUrl: string | null;
  policyKey: string | null;
  score: number;
  status: 'NEW' | 'REVIEW_REQUIRED' | 'REJECTED';
  sourceTypeHints: string[];
  sportHints: string[];
  reasonCodes: string[];
  reasons: string[];
};

export const affiliateSourceDomainPolicyReviewSchema = z.object({
  status: z.enum(AFFILIATE_DOMAIN_POLICY_STATUSES),
  termsUrl: z.string().trim().url().nullable().optional(),
  robotsSummary: z.string().trim().max(10_000).nullable().optional(),
  restrictionNotes: z.string().trim().max(10_000).nullable().optional(),
  expiresAt: z.coerce.date().nullable().optional(),
  evidence: z.record(z.string(), z.unknown()).nullable().optional(),
});

export type AffiliateSourceDomainPolicyReview = z.input<typeof affiliateSourceDomainPolicyReviewSchema>;
