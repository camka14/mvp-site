import { z } from 'zod';

export type AffiliateListingKind = 'EVENT' | 'RENTAL' | 'TEAM' | 'CLUB';
export type AffiliateDateDisplayMode = 'SCHEDULED' | 'NO_FIXED_DATE' | 'ONGOING';

export type ScrapedPage = {
  url: string;
  finalUrl: string;
  statusCode: number | null;
  body: string;
  fetchedAt: string;
};

export interface ScrapePageClient {
  fetchPage(params: { url: string; renderJavascript?: boolean; waitMs?: number }): Promise<ScrapedPage>;
}

export const fieldMappingSchema = z.object({
  selector: z.string().min(1),
  mode: z.enum(['text', 'html', 'attribute', 'literal']).default('text'),
  attribute: z.string().min(1).optional(),
  value: z.string().optional(),
  valueMap: z.record(z.string(), z.string()).optional(),
  fallbackValue: z.string().optional(),
  regex: z.string().min(1).optional(),
  excludeSelectors: z.array(z.string().min(1)).optional(),
  required: z.boolean().optional(),
  transform: z.enum([
    'trim',
    'priceText',
    'dateTime',
    'dateRangeEnd',
    'absoluteUrl',
    'telerikPostBackUrl',
    'previousDaySectionDateTime',
    'venueFromLocationText',
    'addressFromLocationText',
    'cityFromLocationText',
  ]).optional(),
});

export type FieldMapping = z.infer<typeof fieldMappingSchema>;

const affiliateDateDisplayModeSchema = z.enum(['SCHEDULED', 'NO_FIXED_DATE', 'ONGOING']);

const optionalNullableStringSchema = z.string().nullable().optional();

const affiliateManualDivisionSchema = z.object({
  name: z.string().trim().min(1),
  key: z.string().trim().min(1).optional(),
  gender: z.enum(['M', 'F', 'C']).optional(),
  ratingType: z.enum(['AGE', 'SKILL']).optional(),
  divisionTypeId: z.string().trim().min(1).optional(),
  priceCents: z.number().int().min(0).nullable().optional(),
  maxParticipants: z.number().int().min(0).nullable().optional(),
  ageCutoffLabel: optionalNullableStringSchema,
  ageCutoffSource: optionalNullableStringSchema,
});

const affiliateManualCandidateSchema = z.object({
  listingKind: z.enum(['EVENT', 'RENTAL', 'TEAM', 'CLUB']).optional(),
  title: z.string().trim().min(1),
  officialActionUrl: z.string().trim().url(),
  sourceUrl: z.string().trim().url().nullable().optional(),
  tags: z.array(z.string().trim().min(1)).optional(),
  tagText: optionalNullableStringSchema,
  organizerName: optionalNullableStringSchema,
  sportName: optionalNullableStringSchema,
  formatLabel: optionalNullableStringSchema,
  city: optionalNullableStringSchema,
  venueName: optionalNullableStringSchema,
  address: optionalNullableStringSchema,
  startsAt: optionalNullableStringSchema,
  endsAt: optionalNullableStringSchema,
  timeZone: optionalNullableStringSchema,
  scheduleText: optionalNullableStringSchema,
  dateDisplayMode: affiliateDateDisplayModeSchema.optional(),
  dateDisplayText: optionalNullableStringSchema,
  skillLevel: optionalNullableStringSchema,
  ageGroup: optionalNullableStringSchema,
  divisionText: optionalNullableStringSchema,
  maxParticipantsText: optionalNullableStringSchema,
  currentParticipantsText: optionalNullableStringSchema,
  spotsRemainingText: optionalNullableStringSchema,
  participantOptionsText: optionalNullableStringSchema,
  priceText: optionalNullableStringSchema,
  statusText: optionalNullableStringSchema,
  registrationDeadlineText: optionalNullableStringSchema,
  description: optionalNullableStringSchema,
  divisions: z.array(affiliateManualDivisionSchema).optional(),
  warnings: z.array(z.string()).optional(),
});

export const affiliateScrapeMappingSchema = z.object({
  kind: z.enum(['EVENT', 'RENTAL', 'TEAM', 'CLUB']),
  listUrl: z.string().url(),
  renderJavascript: z.boolean().optional(),
  waitMs: z.number().int().min(0).max(30_000).optional(),
  itemSelector: z.string().min(1),
  itemTextIncludes: z.array(z.string().min(1)).optional(),
  itemTextExcludes: z.array(z.string().min(1)).optional(),
  fields: z.object({
    title: fieldMappingSchema,
    officialActionUrl: fieldMappingSchema,
    organizerName: fieldMappingSchema.optional(),
    sportName: fieldMappingSchema.optional(),
    formatLabel: fieldMappingSchema.optional(),
    city: fieldMappingSchema.optional(),
    venueName: fieldMappingSchema.optional(),
    address: fieldMappingSchema.optional(),
    startsAt: fieldMappingSchema.optional(),
    endsAt: fieldMappingSchema.optional(),
    scheduleText: fieldMappingSchema.optional(),
    dateDisplayMode: fieldMappingSchema.optional(),
    dateDisplayText: fieldMappingSchema.optional(),
    skillLevel: fieldMappingSchema.optional(),
    ageGroup: fieldMappingSchema.optional(),
    divisionText: fieldMappingSchema.optional(),
    maxParticipantsText: fieldMappingSchema.optional(),
    currentParticipantsText: fieldMappingSchema.optional(),
    spotsRemainingText: fieldMappingSchema.optional(),
    participantOptionsText: fieldMappingSchema.optional(),
    priceText: fieldMappingSchema.optional(),
    statusText: fieldMappingSchema.optional(),
    registrationDeadlineText: fieldMappingSchema.optional(),
    sourceUrl: fieldMappingSchema.optional(),
    description: fieldMappingSchema.optional(),
    tagText: fieldMappingSchema.optional(),
  }),
  detailPage: z.object({
    urlField: z.enum(['officialActionUrl', 'sourceUrl']),
    fields: z.record(z.string(), fieldMappingSchema),
    renderJavascript: z.boolean().optional(),
    waitMs: z.number().int().min(0).max(30_000).optional(),
    requestDelayMs: z.number().int().min(0).max(30_000).optional(),
  }).optional(),
  dedupe: z.object({
    fields: z.array(z.string().min(1)).min(1),
  }).optional(),
  manualCandidates: z.array(affiliateManualCandidateSchema).optional(),
});

export type AffiliateScrapeMapping = z.infer<typeof affiliateScrapeMappingSchema>;

export type AffiliateCandidateInput = {
  listingKind: AffiliateListingKind;
  title: string;
  organizerName?: string | null;
  sportName?: string | null;
  formatLabel?: string | null;
  city?: string | null;
  venueName?: string | null;
  address?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  timeZone?: string | null;
  scheduleText?: string | null;
  dateDisplayMode?: AffiliateDateDisplayMode | string | null;
  dateDisplayText?: string | null;
  skillLevel?: string | null;
  ageGroup?: string | null;
  divisionText?: string | null;
  maxParticipantsText?: string | null;
  currentParticipantsText?: string | null;
  spotsRemainingText?: string | null;
  participantOptionsText?: string | null;
  priceText?: string | null;
  statusText?: string | null;
  registrationDeadlineText?: string | null;
  officialActionUrl: string;
  sourceUrl: string;
  tags?: string[];
  tagText?: string | null;
  description?: string | null;
  rawPayload?: Record<string, unknown>;
  warnings?: string[];
};

export const parseAffiliateScrapeMapping = (value: unknown): AffiliateScrapeMapping => (
  affiliateScrapeMappingSchema.parse(value)
);
