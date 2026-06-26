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

const normalizeDateText = (value: string): string => (
  normalizeWhitespace(value)
    .replace(/\b(\d{1,2})(st|nd|rd|th)\b/gi, '$1')
    .replace(/\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+/gi, '')
);

const parseDateWithOptionalYear = (
  value: string,
  referenceDate: Date,
  options: { endOfDay?: boolean } = {},
): Date | null => {
  const normalized = normalizeDateText(value);
  if (!normalized) return null;

  const hasYear = /\b\d{4}\b/.test(normalized);
  const text = hasYear ? normalized : `${normalized}, ${referenceDate.getFullYear()}`;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  if (options.endOfDay) {
    parsed.setHours(23, 59, 59, 999);
  }
  return parsed;
};

const toAbsoluteUrl = (value: string, baseUrl: string): string => {
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return value;
  }
};

const parseDateTimeValue = (value: string, referenceDate: Date): string => {
  const trimmed = normalizeDateText(value);
  if (!trimmed) return '';

  const explicitStart = trimmed.match(/^([A-Za-z]+\s+\d{1,2},\s*\d{4})\b/);
  if (explicitStart) {
    const explicitStartDate = new Date(explicitStart[1]);
    if (!Number.isNaN(explicitStartDate.getTime())) {
      return explicitStartDate.toISOString();
    }
  }

  const compactRangeStart = trimmed.match(/^([A-Za-z]+)\s+(\d{1,2})\s*[-–]\s*\d{1,2},\s*(\d{4})\b/);
  if (compactRangeStart) {
    const compactStartDate = new Date(`${compactRangeStart[1]} ${compactRangeStart[2]}, ${compactRangeStart[3]}`);
    if (!Number.isNaN(compactStartDate.getTime())) {
      return compactStartDate.toISOString();
    }
  }

  const noYearRangeStart = !/\b\d{4}\b/.test(trimmed)
    ? trimmed.match(/^([A-Za-z]+\s+\d{1,2})\s*[-–]\s*(?:[A-Za-z]+\s+)?\d{1,2}\b/)
    : null;
  if (noYearRangeStart) {
    const noYearStartDate = parseDateWithOptionalYear(noYearRangeStart[1], referenceDate);
    if (noYearStartDate) {
      return noYearStartDate.toISOString();
    }
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }

  const noYearDate = parseDateWithOptionalYear(trimmed, referenceDate);
  if (noYearDate) {
    return noYearDate.toISOString();
  }

  return trimmed;
};

const parseDateRangeEndValue = (value: string, referenceDate: Date): string => {
  const trimmed = normalizeDateText(value);
  if (!trimmed) return '';

  const explicitEnd = trimmed.match(/[-–]\s*([A-Za-z]+\s+\d{1,2},\s*\d{4})\b/);
  if (explicitEnd) {
    const explicitEndDate = new Date(explicitEnd[1]);
    if (!Number.isNaN(explicitEndDate.getTime())) {
      return explicitEndDate.toISOString();
    }
  }

  const compactEnd = trimmed.match(/^([A-Za-z]+)\s+\d{1,2}\s*[-–]\s*(\d{1,2}),\s*(\d{4})\b/);
  if (compactEnd) {
    const compactEndDate = new Date(`${compactEnd[1]} ${compactEnd[2]}, ${compactEnd[3]}`);
    if (!Number.isNaN(compactEndDate.getTime())) {
      return compactEndDate.toISOString();
    }
  }

  const noYearEnd = trimmed.match(/^([A-Za-z]+)\s+\d{1,2}\s*[-–]\s*([A-Za-z]+\s+\d{1,2}|\d{1,2})\b/);
  if (noYearEnd) {
    const endText = /^[A-Za-z]+/.test(noYearEnd[2])
      ? noYearEnd[2]
      : `${noYearEnd[1]} ${noYearEnd[2]}`;
    const noYearEndDate = parseDateWithOptionalYear(endText, referenceDate);
    if (noYearEndDate) {
      return noYearEndDate.toISOString();
    }
  }

  return parseDateTimeValue(trimmed, referenceDate);
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

const applyValueMap = (value: string, mapping: FieldMapping): string => {
  if (!mapping.valueMap) return value;
  const normalizedValue = normalizeWhitespace(value);
  const directMatch = mapping.valueMap[value] ?? mapping.valueMap[normalizedValue];
  if (directMatch != null) return directMatch;

  const lowerValue = normalizedValue.toLowerCase();
  const caseInsensitiveMatch = Object.entries(mapping.valueMap).find(([key]) => (
    normalizeWhitespace(key).toLowerCase() === lowerValue
  ));
  return caseInsensitiveMatch?.[1] ?? mapping.fallbackValue ?? '';
};

const extractFieldValue = (
  root: Element,
  mapping: FieldMapping,
  baseUrl: string,
  referenceDate: Date,
): string | null => {
  let value = '';
  if (mapping.mode === 'literal') {
    value = mapping.value ?? '';
  } else {
    const element = selectElement(root, mapping.selector);
    if (!element) {
      return null;
    }

    if (mapping.mode === 'attribute') {
      value = mapping.attribute ? element.getAttribute(mapping.attribute) ?? '' : '';
    } else if (mapping.mode === 'html') {
      value = element.innerHTML;
    } else {
      value = element.textContent ?? '';
    }
  }

  value = applyRegex(value, mapping.regex);
  value = applyValueMap(value, mapping);
  if (normalizeWhitespace(value).length === 0) {
    return null;
  }

  const transform = mapping.transform ?? 'trim';
  if (transform === 'absoluteUrl') {
    value = toAbsoluteUrl(normalizeWhitespace(value), baseUrl);
  } else if (transform === 'dateTime') {
    value = parseDateTimeValue(value, referenceDate);
  } else if (transform === 'dateRangeEnd') {
    value = parseDateRangeEndValue(value, referenceDate);
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
  const referenceDate = new Date(page.fetchedAt);
  const effectiveReferenceDate = Number.isNaN(referenceDate.getTime()) ? new Date() : referenceDate;
  const requiredIncludes = (mapping.itemTextIncludes ?? []).map((value) => normalizeWhitespace(value).toLowerCase());
  const requiredExcludes = (mapping.itemTextExcludes ?? []).map((value) => normalizeWhitespace(value).toLowerCase());
  const itemElements = Array.from(dom.window.document.querySelectorAll(mapping.itemSelector))
    .filter((element) => {
      const itemText = normalizeWhitespace(element.textContent ?? '').toLowerCase();
      return requiredIncludes.every((needle) => itemText.includes(needle))
        && !requiredExcludes.some((needle) => itemText.includes(needle));
    });
  const baseUrl = page.finalUrl || page.url;

  return itemElements
    .map((element, index): AffiliateCandidateInput | null => {
      const warnings: string[] = [];
      const fieldValues: Partial<Record<ExtractedFieldName, string | null>> = {};

      for (const [fieldName, fieldMapping] of Object.entries(mapping.fields) as Array<[ExtractedFieldName, FieldMapping]>) {
        const value = extractFieldValue(element, fieldMapping, baseUrl, effectiveReferenceDate);
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
