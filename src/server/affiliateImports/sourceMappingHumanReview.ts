import { prisma } from '@/lib/prisma';

type JsonRecord = Record<string, unknown>;

type HumanReviewJobRow = {
  id: string;
  intakeId: string;
  status: string;
  updatedAt: Date | string;
  finishedAt?: Date | string | null;
  attemptCount?: number | null;
  errorMessage?: string | null;
  resultSummary?: unknown;
};

type HumanReviewIntakeRow = {
  id: string;
  name: string;
  sourceKey: string;
  region?: string | null;
  baseUrl?: string | null;
  status: string;
  complianceStatus: string;
  selectedLogoArtifactId?: string | null;
};

export type AffiliateMappingHumanReviewRow = {
  jobId: string;
  intakeId: string;
  intakeName: string;
  sourceKey: string;
  region: string | null;
  baseUrl: string | null;
  intakeStatus: string;
  complianceStatus: string;
  attemptCount: number;
  markedAt: string;
  errorMessage: string | null;
  source: string | null;
  requestedNextAction: string | null;
  reasonCodes: string[];
  rationale: string | null;
  blockingIssues: string[];
  hasSelectedLogo: boolean;
};

const reviewDb = () => ({
  jobs: (prisma as any).affiliateSourceMappingJobs,
  intakes: (prisma as any).affiliateSourceIntakes,
});

const recordValue = (value: unknown): JsonRecord => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
);

const stringValue = (value: unknown): string | null => (
  typeof value === 'string' && value.trim() ? value.trim() : null
);

const stringValues = (value: unknown): string[] => (
  Array.isArray(value)
    ? Array.from(new Set(value.map(stringValue).filter((entry): entry is string => Boolean(entry))))
    : []
);

const isoValue = (value: Date | string | null | undefined): string => {
  const parsed = value instanceof Date ? value : new Date(value ?? 0);
  return Number.isNaN(parsed.getTime()) ? new Date(0).toISOString() : parsed.toISOString();
};

export const listAffiliateMappingHumanReviewJobs = async (
  options: { limit?: number } = {},
): Promise<AffiliateMappingHumanReviewRow[]> => {
  const limit = Math.max(1, Math.min(250, options.limit ?? 100));
  const { jobs, intakes } = reviewDb();
  const jobRows: HumanReviewJobRow[] = await jobs.findMany({
    where: { status: 'HUMAN_REVIEW_REQUIRED' },
    orderBy: { updatedAt: 'desc' },
    take: limit,
    select: {
      id: true,
      intakeId: true,
      status: true,
      updatedAt: true,
      finishedAt: true,
      attemptCount: true,
      errorMessage: true,
      resultSummary: true,
    },
  });
  if (!jobRows.length) return [];

  const intakeRows: HumanReviewIntakeRow[] = await intakes.findMany({
    where: { id: { in: Array.from(new Set(jobRows.map((job) => job.intakeId))) } },
    select: {
      id: true,
      name: true,
      sourceKey: true,
      region: true,
      baseUrl: true,
      status: true,
      complianceStatus: true,
      selectedLogoArtifactId: true,
    },
  });
  const intakeById = new Map(intakeRows.map((intake) => [intake.id, intake]));

  return jobRows.map((job) => {
    const intake = intakeById.get(job.intakeId);
    const humanReview = recordValue(recordValue(job.resultSummary).humanReviewRequired);
    return {
      jobId: job.id,
      intakeId: job.intakeId,
      intakeName: intake?.name ?? 'Missing intake',
      sourceKey: intake?.sourceKey ?? job.intakeId,
      region: stringValue(intake?.region),
      baseUrl: stringValue(intake?.baseUrl),
      intakeStatus: intake?.status ?? 'MISSING',
      complianceStatus: intake?.complianceStatus ?? 'UNKNOWN',
      attemptCount: typeof job.attemptCount === 'number' ? job.attemptCount : 0,
      markedAt: isoValue(stringValue(humanReview.markedAt) ?? job.finishedAt ?? job.updatedAt),
      errorMessage: stringValue(job.errorMessage),
      source: stringValue(humanReview.source),
      requestedNextAction: stringValue(humanReview.requestedNextAction),
      reasonCodes: stringValues(humanReview.reasonCodes),
      rationale: stringValue(humanReview.rationale),
      blockingIssues: stringValues(humanReview.blockingIssues),
      hasSelectedLogo: Boolean(intake?.selectedLogoArtifactId),
    };
  });
};
