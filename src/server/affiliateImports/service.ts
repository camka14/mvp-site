import { createHash } from 'crypto';
import { prisma } from '@/lib/prisma';
import { createId } from '@/lib/id';
import { extractAffiliateCandidatesFromPage } from './mappingExtractor';
import { scrapingDogClient } from './scrapingDogClient';
import {
  type AffiliateCandidateInput,
  type AffiliateScrapeMapping,
  parseAffiliateScrapeMapping,
  type ScrapePageClient,
} from './types';

type AffiliateSourceCreateInput = {
  name: string;
  sourceKey: string;
  listUrl: string;
  targetKind?: string;
  baseUrl?: string | null;
  status?: string;
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
  mapping?: AffiliateScrapeMapping;
};

type AffiliateScrapeSourceRow = {
  id: string;
  activeMappingId: string | null;
  listUrl: string;
};

type AffiliateScrapeMappingRow = {
  id: string;
  sourceId: string;
  mapping: unknown;
};

const affiliatePrisma = () => {
  const client = prisma as any;
  return {
    sources: client.affiliateScrapeSources,
    mappings: client.affiliateScrapeMappings,
    runs: client.affiliateScrapeRuns,
    candidates: client.affiliateImportCandidates,
    listings: client.affiliateListings,
  };
};

const nullableString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeStatus = (value: unknown, fallback: string): string => (
  nullableString(value)?.toUpperCase() ?? fallback
);

const parseDateOrNull = (value: string | null | undefined): Date | null => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const candidateValue = (candidate: AffiliateCandidateInput, fieldName: string): string => {
  const value = (candidate as Record<string, unknown>)[fieldName];
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
};

export const buildAffiliateCandidateDedupeKey = (
  sourceId: string,
  candidate: AffiliateCandidateInput,
  mapping: AffiliateScrapeMapping,
): string => {
  const fields = mapping.dedupe?.fields?.length
    ? mapping.dedupe.fields
    : ['officialActionUrl', 'title', 'startsAt'];
  const raw = [
    sourceId,
    ...fields.map((fieldName) => candidateValue(candidate, fieldName)),
  ].join('|');
  return createHash('sha256').update(raw).digest('hex');
};

const candidatePersistenceData = (
  params: {
    sourceId: string;
    runId: string;
    mappingId: string | null;
    dedupeKey: string;
    candidate: AffiliateCandidateInput;
  },
) => {
  const { sourceId, runId, mappingId, dedupeKey, candidate } = params;
  return {
    sourceId,
    runId,
    mappingId,
    listingKind: candidate.listingKind,
    dedupeKey,
    title: candidate.title,
    organizerName: candidate.organizerName ?? null,
    sportName: candidate.sportName ?? null,
    formatLabel: candidate.formatLabel ?? null,
    city: candidate.city ?? null,
    venueName: candidate.venueName ?? null,
    address: candidate.address ?? null,
    startsAt: parseDateOrNull(candidate.startsAt),
    endsAt: parseDateOrNull(candidate.endsAt),
    timeZone: candidate.timeZone ?? null,
    scheduleText: candidate.scheduleText ?? null,
    skillLevel: candidate.skillLevel ?? null,
    ageGroup: candidate.ageGroup ?? null,
    divisionText: candidate.divisionText ?? null,
    participantOptionsText: candidate.participantOptionsText ?? null,
    priceText: candidate.priceText ?? null,
    statusText: candidate.statusText ?? null,
    registrationDeadlineText: candidate.registrationDeadlineText ?? null,
    officialActionUrl: candidate.officialActionUrl,
    sourceUrl: candidate.sourceUrl,
    description: candidate.description ?? null,
    rawPayload: candidate.rawPayload ?? null,
    warnings: candidate.warnings ?? [],
  };
};

export const listAffiliateSources = async () => {
  const { sources } = affiliatePrisma();
  return sources.findMany({
    orderBy: { name: 'asc' },
  });
};

export const createAffiliateSource = async (input: AffiliateSourceCreateInput, adminUserId?: string) => {
  const { sources, mappings } = affiliatePrisma();
  const sourceId = createId();
  const source = await sources.create({
    data: {
      id: sourceId,
      name: input.name.trim(),
      sourceKey: input.sourceKey.trim(),
      baseUrl: nullableString(input.baseUrl),
      listUrl: input.listUrl.trim(),
      targetKind: normalizeStatus(input.targetKind, 'EVENT'),
      status: normalizeStatus(input.status, 'ACTIVE'),
      notes: nullableString(input.notes),
      metadata: input.metadata ?? null,
    },
  });

  if (!input.mapping) {
    return source;
  }

  const mapping = await mappings.create({
    data: {
      id: createId(),
      sourceId,
      version: 1,
      isActive: true,
      mapping: input.mapping,
      createdByUserId: adminUserId ?? null,
    },
  });

  return sources.update({
    where: { id: sourceId },
    data: { activeMappingId: mapping.id },
  });
};

const resolveActiveMapping = async (
  source: AffiliateScrapeSourceRow,
): Promise<{ row: AffiliateScrapeMappingRow; mapping: AffiliateScrapeMapping }> => {
  const { mappings } = affiliatePrisma();
  const mappingRow = source.activeMappingId
    ? await mappings.findUnique({ where: { id: source.activeMappingId } })
    : await mappings.findFirst({
        where: { sourceId: source.id, isActive: true },
        orderBy: { version: 'desc' },
      });

  if (!mappingRow) {
    throw new Error('No active scrape mapping is configured for this source.');
  }

  return {
    row: mappingRow,
    mapping: parseAffiliateScrapeMapping(mappingRow.mapping),
  };
};

export const runAffiliateSourceScrape = async (
  sourceId: string,
  params: { requestedByUserId?: string | null; client?: ScrapePageClient } = {},
) => {
  const { sources, runs, candidates } = affiliatePrisma();
  const source = await sources.findUnique({ where: { id: sourceId } });
  if (!source) {
    throw new Error('Affiliate scrape source not found.');
  }

  const { row: mappingRow, mapping } = await resolveActiveMapping(source);
  const run = await runs.create({
    data: {
      id: createId(),
      sourceId,
      mappingId: mappingRow.id,
      requestedByUserId: params.requestedByUserId ?? null,
      status: 'RUNNING',
      fetchedUrl: mapping.listUrl,
    },
  });

  try {
    const client = params.client ?? scrapingDogClient;
    const page = await client.fetchPage({
      url: mapping.listUrl || source.listUrl,
      renderJavascript: mapping.renderJavascript,
      waitMs: mapping.waitMs,
    });
    const extractedCandidates = extractAffiliateCandidatesFromPage(page, mapping);
    const savedCandidates = [];

    for (const candidate of extractedCandidates) {
      const dedupeKey = buildAffiliateCandidateDedupeKey(sourceId, candidate, mapping);
      const existing = await candidates.findUnique({
        where: {
          sourceId_dedupeKey: {
            sourceId,
            dedupeKey,
          },
        },
      });
      const data = candidatePersistenceData({
        sourceId,
        runId: run.id,
        mappingId: mappingRow.id,
        dedupeKey,
        candidate,
      });

      const saved = existing
        ? await candidates.update({
            where: { id: existing.id },
            data: {
              ...data,
              status: existing.status === 'PUBLISHED' ? 'PUBLISHED' : 'DISCOVERED',
            },
          })
        : await candidates.create({
            data: {
              id: createId(),
              ...data,
            },
          });
      savedCandidates.push(saved);
    }

    const finishedRun = await runs.update({
      where: { id: run.id },
      data: {
        status: 'SUCCEEDED',
        finishedAt: new Date(),
        finalUrl: page.finalUrl,
        httpStatus: page.statusCode,
        itemCount: extractedCandidates.length,
        candidateCount: savedCandidates.length,
      },
    });
    await sources.update({
      where: { id: sourceId },
      data: {
        lastScrapeRunId: run.id,
        lastScrapedAt: new Date(),
      },
    });

    return {
      run: finishedRun,
      candidates: savedCandidates,
    };
  } catch (error) {
    await runs.update({
      where: { id: run.id },
      data: {
        status: 'FAILED',
        finishedAt: new Date(),
        errorMessage: error instanceof Error ? error.message : 'Scrape failed.',
      },
    });
    throw error;
  }
};

export const listAffiliateCandidates = async (params: { status?: string | null; sourceId?: string | null } = {}) => {
  const { candidates } = affiliatePrisma();
  const where: Record<string, unknown> = {};
  const status = nullableString(params.status);
  const sourceId = nullableString(params.sourceId);
  if (status) where.status = status.toUpperCase();
  if (sourceId) where.sourceId = sourceId;

  return candidates.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    take: 100,
  });
};

export const getAffiliateCandidate = async (candidateId: string) => {
  const { candidates } = affiliatePrisma();
  return candidates.findUnique({ where: { id: candidateId } });
};

const listingDataFromCandidate = (candidate: any, publishedByUserId?: string | null) => ({
  sourceId: candidate.sourceId,
  candidateId: candidate.id,
  listingKind: candidate.listingKind,
  status: 'PUBLISHED',
  title: candidate.title,
  organizerName: candidate.organizerName,
  sportName: candidate.sportName,
  formatLabel: candidate.formatLabel,
  city: candidate.city,
  venueName: candidate.venueName,
  address: candidate.address,
  startsAt: candidate.startsAt,
  endsAt: candidate.endsAt,
  timeZone: candidate.timeZone,
  scheduleText: candidate.scheduleText,
  skillLevel: candidate.skillLevel,
  ageGroup: candidate.ageGroup,
  divisionText: candidate.divisionText,
  participantOptionsText: candidate.participantOptionsText,
  priceText: candidate.priceText,
  statusText: candidate.statusText,
  registrationDeadlineText: candidate.registrationDeadlineText,
  officialActionUrl: candidate.officialActionUrl,
  sourceUrl: candidate.sourceUrl,
  description: candidate.description,
  rawPayload: candidate.rawPayload,
  publishedByUserId: publishedByUserId ?? null,
});

export const publishAffiliateCandidate = async (
  candidateId: string,
  params: { publishedByUserId?: string | null } = {},
) => {
  const { candidates, listings } = affiliatePrisma();
  const candidate = await candidates.findUnique({ where: { id: candidateId } });
  if (!candidate) {
    throw new Error('Affiliate import candidate not found.');
  }

  if (candidate.publishedListingId) {
    const existingListing = await listings.findUnique({ where: { id: candidate.publishedListingId } });
    if (existingListing) {
      return existingListing;
    }
  }

  const listing = await listings.create({
    data: {
      id: createId(),
      ...listingDataFromCandidate(candidate, params.publishedByUserId),
    },
  });
  await candidates.update({
    where: { id: candidateId },
    data: {
      status: 'PUBLISHED',
      publishedListingId: listing.id,
    },
  });
  return listing;
};
