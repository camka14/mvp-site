import { z } from 'zod';

export type AffiliateListingKind = 'EVENT' | 'RENTAL';

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
  mode: z.enum(['text', 'html', 'attribute']).default('text'),
  attribute: z.string().min(1).optional(),
  regex: z.string().min(1).optional(),
  required: z.boolean().optional(),
  transform: z.enum(['trim', 'priceText', 'dateTime', 'absoluteUrl']).optional(),
});

export type FieldMapping = z.infer<typeof fieldMappingSchema>;

export const affiliateScrapeMappingSchema = z.object({
  kind: z.enum(['EVENT', 'RENTAL']),
  listUrl: z.string().url(),
  renderJavascript: z.boolean().optional(),
  waitMs: z.number().int().min(0).max(30_000).optional(),
  itemSelector: z.string().min(1),
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
    skillLevel: fieldMappingSchema.optional(),
    ageGroup: fieldMappingSchema.optional(),
    divisionText: fieldMappingSchema.optional(),
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
  skillLevel?: string | null;
  ageGroup?: string | null;
  divisionText?: string | null;
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
