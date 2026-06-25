import { JSDOM } from 'jsdom';
import type {
  AffiliateCandidateInput,
  AffiliateScrapeMapping,
  FieldMapping,
  ScrapedPage,
} from './types';

type ExtractedFieldName = keyof AffiliateScrapeMapping['fields'];

const nullableFieldNames = [
  'organizerName',
  'sportName',
  'formatLabel',
  'city',
  'venueName',
  'address',
  'startsAt',
  'endsAt',
  'scheduleText',
  'skillLevel',
  'ageGroup',
  'divisionText',
  'participantOptionsText',
  'priceText',
  'statusText',
  'registrationDeadlineText',
  'sourceUrl',
  'description',
] as const;

const normalizeWhitespace = (value: string): string => (
  value.replace(/\s+/g, ' ').trim()
);

const toAbsoluteUrl = (value: string, baseUrl: string): string => {
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return value;
  }
};

const parseDateTimeValue = (value: string): string => {
  const trimmed = normalizeWhitespace(value);
  if (!trimmed) return '';
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? trimmed : parsed.toISOString();
};

const selectElement = (root: Element, selector: string): Element | null => {
  const normalized = selector.trim();
  if (normalized === ':scope' || normalized === '&') {
    return root;
  }
  return root.querySelector(normalized);
};

const applyRegex = (value: string, pattern?: string): string => {
  if (!pattern) return value;
  const match = value.match(new RegExp(pattern, 'i'));
  if (!match) return '';
  return match[1] ?? match[0] ?? '';
};

const extractFieldValue = (root: Element, mapping: FieldMapping, baseUrl: string): string | null => {
  const element = selectElement(root, mapping.selector);
  if (!element) {
    return null;
  }

  let value = '';
  if (mapping.mode === 'attribute') {
    value = mapping.attribute ? element.getAttribute(mapping.attribute) ?? '' : '';
  } else if (mapping.mode === 'html') {
    value = element.innerHTML;
  } else {
    value = element.textContent ?? '';
  }

  value = applyRegex(value, mapping.regex);
  if (normalizeWhitespace(value).length === 0) {
    return null;
  }

  const transform = mapping.transform ?? 'trim';
  if (transform === 'absoluteUrl') {
    value = toAbsoluteUrl(normalizeWhitespace(value), baseUrl);
  } else if (transform === 'dateTime') {
    value = parseDateTimeValue(value);
  } else {
    value = normalizeWhitespace(value);
  }

  return value.length > 0 ? value : null;
};

export const extractAffiliateCandidatesFromPage = (
  page: ScrapedPage,
  mapping: AffiliateScrapeMapping,
): AffiliateCandidateInput[] => {
  const dom = new JSDOM(page.body, { url: page.finalUrl || page.url });
  const itemElements = Array.from(dom.window.document.querySelectorAll(mapping.itemSelector));
  const baseUrl = page.finalUrl || page.url;

  return itemElements
    .map((element, index): AffiliateCandidateInput | null => {
      const warnings: string[] = [];
      const fieldValues: Partial<Record<ExtractedFieldName, string | null>> = {};

      for (const [fieldName, fieldMapping] of Object.entries(mapping.fields) as Array<[ExtractedFieldName, FieldMapping]>) {
        const value = extractFieldValue(element, fieldMapping, baseUrl);
        if (!value && fieldMapping.required) {
          warnings.push(`Missing required field: ${fieldName}`);
        }
        fieldValues[fieldName] = value;
      }

      const title = fieldValues.title;
      const officialActionUrl = fieldValues.officialActionUrl;
      if (!title || !officialActionUrl) {
        return null;
      }

      const sourceUrl = fieldValues.sourceUrl || officialActionUrl || page.url;
      const candidate: AffiliateCandidateInput = {
        listingKind: mapping.kind,
        title,
        officialActionUrl,
        sourceUrl,
        rawPayload: {
          sourceIndex: index,
          extractedFields: fieldValues,
        },
        warnings,
      };

      nullableFieldNames.forEach((fieldName) => {
        const value = fieldValues[fieldName];
        if (value) {
          candidate[fieldName] = value;
        }
      });

      return candidate;
    })
    .filter((candidate): candidate is AffiliateCandidateInput => Boolean(candidate));
};
