import { z } from 'zod';
import { AFFILIATE_DISCOVERY_SOURCE_TYPES } from './sourceDiscoveryTypes';

export const AFFILIATE_COVERAGE_JOB_TYPES = [
  'FAILED_INTAKE_CAPTURE',
  'MARKET_COVERAGE',
] as const;

export const AFFILIATE_COVERAGE_JOB_STATUSES = [
  'QUEUED',
  'CLAIMED',
  'WAITING_FOR_PIPELINE',
  'RETRY_SCHEDULED',
  'COMPLETED',
  'EXCLUDED',
  'HUMAN_REVIEW_REQUIRED',
] as const;

export const AFFILIATE_COVERAGE_DECISIONS = [
  'CAMPAIGNS_CREATED',
  'CAPTURE_RECOVERED',
  'COVERED',
  'HUMAN_REVIEW_REQUIRED',
  'MAPPER_REPAIR_REQUIRED',
  'RETRY_LATER',
  'SOURCE_EXCLUDED',
  'WAITING_FOR_PIPELINE',
] as const;

const agentId = z.string().trim().regex(
  /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/,
  'Coverage agent id must use 1-80 letters, numbers, dots, underscores, or hyphens.',
);

export const affiliateCoverageCampaignProposalSchema = z.object({
  schemaVersion: z.literal(1),
  jobId: z.string().trim().min(1),
  agentId,
  name: z.string().trim().min(2).max(160),
  region: z.string().trim().min(2).max(200),
  location: z.string().trim().min(2).max(200).nullable().optional(),
  sportIds: z.array(z.string().trim().min(1)).min(1).max(50),
  sourceTypeHints: z.array(z.enum(AFFILIATE_DISCOVERY_SOURCE_TYPES)).min(1).max(10),
  coverageArchetypes: z.array(z.enum([
    'CLUB_OR_ACADEMY',
    'COMPETITION_OPERATOR',
    'FACILITY',
    'GOVERNING_ASSOCIATION',
    'RECREATION_DEPARTMENT',
    'TRAINING_PROVIDER',
  ])).min(1).max(6),
  rationale: z.string().trim().min(10).max(4_000),
  searchIntervalMinutes: z.number().int().min(1_440).max(525_600).default(10_080),
  maxQueriesPerRun: z.number().int().min(1).max(50).default(10),
  maxResultsPerQuery: z.number().int().min(1).max(20).default(10),
});

export type AffiliateCoverageCampaignProposal = z.infer<typeof affiliateCoverageCampaignProposalSchema>;

export const affiliateCoverageCompletionSchema = z.object({
  schemaVersion: z.literal(1),
  jobId: z.string().trim().min(1),
  agentId,
  decision: z.enum(AFFILIATE_COVERAGE_DECISIONS),
  summary: z.string().trim().min(10).max(8_000),
  campaignIds: z.array(z.string().trim().min(1)).max(50).default([]),
  manualRunId: z.string().trim().min(1).nullable().optional(),
  coverageEvidence: z.object({
    sourceFamilies: z.array(z.string().trim().min(1)).max(20).default([]),
    completedQueryProfiles: z.array(z.string().trim().min(1)).max(50).default([]),
    recentNewDomainYields: z.array(z.number().int().min(0)).max(20).default([]),
    unresolvedLeadCount: z.number().int().min(0).nullable().default(null),
    notes: z.array(z.string().trim().min(1)).max(50).default([]),
  }).nullable().optional(),
  reasonCodes: z.array(z.string().trim().regex(/^[A-Z0-9_]+$/)).max(50).default([]),
});

export type AffiliateCoverageCompletion = z.infer<typeof affiliateCoverageCompletionSchema>;
