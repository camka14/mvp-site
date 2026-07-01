import { z } from 'zod';

export type AffiliateListingKind = 'EVENT' | 'RENTAL' | 'TEAM';
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
  transform: z.enum(['trim', 'priceText', 'dateTime', 'dateRangeEnd', 'absoluteUrl', 'telerikPostBackUrl']).optional(),
});

export type FieldMapping = z.infer<typeof fieldMappingSchema>;

const affiliateDateDisplayModeSchema = z.enum(['SCHEDULED', 'NO_FIXED_DATE', 'ONGOING']);

const optionalNullableStringSchema = z.string().nullable().optional();

const affiliateManualCandidateSchema = z.object({
  title: z.string().trim().min(1),
  officialActionUrl: z.string().trim().url(),
  sourceUrl: z.string().trim().url().nullable().optional(),
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
  warnings: z.array(z.string()).optional(),
});

export const affiliateScrapeMappingSchema = z.object({
  kind: z.enum(['EVENT', 'RENTAL', 'TEAM']),
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
  }),
  detailPage: z.object({
    urlField: z.enum(['officialActionUrl', 'sourceUrl']),
    fields: z.record(z.string(), fieldMappingSchema),
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
  description?: string | null;
  rawPayload?: Record<string, unknown>;
  warnings?: string[];
};

export const parseAffiliateScrapeMapping = (value: unknown): AffiliateScrapeMapping => (
  affiliateScrapeMappingSchema.parse(value)
);
