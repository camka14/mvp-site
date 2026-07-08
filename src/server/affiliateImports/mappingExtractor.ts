import { JSDOM, VirtualConsole } from 'jsdom';
import type {
  AffiliateCandidateInput,
  AffiliateScrapeMapping,
  FieldMapping,
  ScrapedPage,
} from './types';

type ExtractedFieldName = keyof AffiliateScrapeMapping['fields'];
export type ExtractedAffiliateFieldValues = Record<string, string | null>;

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
  'dateDisplayMode',
  'dateDisplayText',
  'skillLevel',
  'ageGroup',
  'divisionText',
  'maxParticipantsText',
  'currentParticipantsText',
  'spotsRemainingText',
  'participantOptionsText',
  'priceText',
  'statusText',
  'registrationDeadlineText',
  'sourceUrl',
  'description',
  'tagText',
] as const;

const createDom = (html: string, url: string): JSDOM => (
  new JSDOM(html, {
    url,
    virtualConsole: new VirtualConsole(),
  })
);

const normalizeWhitespace = (value: string): string => (
  value.replace(/\s+/g, ' ').trim()
);

const normalizeTagInputs = (value: unknown): string[] => {
  const rawValues = Array.isArray(value)
    ? value
    : (typeof value === 'string' ? value.split(/[,;|]/) : []);
  const seen = new Set<string>();
  const tags: string[] = [];
  rawValues.forEach((rawValue) => {
    if (typeof rawValue !== 'string') return;
    const tag = normalizeWhitespace(rawValue);
    if (!tag) return;
    const key = tag.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    tags.push(tag);
  });
  return tags;
};

const normalizeDateText = (value: string): string => (
  normalizeWhitespace(value)
    .replace(/\b(\d{1,2})(st|nd|rd|th)\b/gi, '$1')
    .replace(/\bSept\.?\b/gi, 'September')
    .replace(/\b(Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.\b/gi, '$1')
    .replace(/\s+(?:&|and)\s+/gi, ' – ')
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

const escapeRegExp = (value: string): string => (
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
);

const findTelerikPostBackUrl = (dom: Document, elementId: string, baseUrl: string): string | null => {
  const scripts = Array.from(dom.querySelectorAll('script'));
  const idPattern = escapeRegExp(elementId);
  const uniqueIdPattern = escapeRegExp(elementId.replace(/_/g, '$'));
  const buttonScript = scripts
    .map((script) => script.textContent ?? '')
    .find((text) => text.includes(elementId) || text.includes(uniqueIdPattern));
  if (!buttonScript) return null;

  const postBackPattern = new RegExp(
    `WebForm_DoPostBackWithOptions\\(new WebForm_PostBackOptions\\('(?:${idPattern}|${uniqueIdPattern})'[^)]*?,\\s*'([^']+)'`,
  );
  const match = buttonScript.match(postBackPattern);
  const rawUrl = match?.[1]?.replace(/\\\\u0026/g, '&');
  return rawUrl ? toAbsoluteUrl(rawUrl, baseUrl) : null;
};

const parseDateTimeValue = (value: string, referenceDate: Date): string => {
  const trimmed = normalizeDateText(value);
  if (!trimmed) return '';

  const numericDate = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})\b/);
  if (numericDate) {
    const month = Number.parseInt(numericDate[1], 10);
    const day = Number.parseInt(numericDate[2], 10);
    const rawYear = Number.parseInt(numericDate[3], 10);
    const year = numericDate[3].length === 2 ? 2000 + rawYear : rawYear;
    const parsed = new Date(year, month - 1, day);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

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

  const crossMonthRangeStart = trimmed.match(/^([A-Za-z]+)\s+(\d{1,2})\s*[-–]\s*[A-Za-z]+\s+\d{1,2},\s*(\d{4})\b/);
  if (crossMonthRangeStart) {
    const crossMonthStartDate = new Date(`${crossMonthRangeStart[1]} ${crossMonthRangeStart[2]}, ${crossMonthRangeStart[3]}`);
    if (!Number.isNaN(crossMonthStartDate.getTime())) {
      return crossMonthStartDate.toISOString();
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

  if (!/\b\d{4}\b/.test(trimmed)) {
    const noYearDate = parseDateWithOptionalYear(trimmed, referenceDate);
    if (noYearDate) {
      return noYearDate.toISOString();
    }
  } else {
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
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

const findNearestPreviousText = (element: Element, selector: string): string | null => {
  let current: Element | null = element;
  while (current) {
    let sibling = current.previousElementSibling;
    while (sibling) {
      if (sibling.matches(selector)) {
        return sibling.textContent ?? null;
      }
      const nestedMatches = Array.from(sibling.querySelectorAll(selector));
      const lastNestedMatch = nestedMatches[nestedMatches.length - 1];
      if (lastNestedMatch) {
        return lastNestedMatch.textContent ?? null;
      }
      sibling = sibling.previousElementSibling;
    }
    current = current.parentElement;
  }
  return null;
};

const parsePreviousDaySectionDateTimeValue = (
  element: Element | null,
  value: string,
  referenceDate: Date,
): string => {
  if (!element) return '';
  const timeMatch = normalizeWhitespace(value).match(/\b(\d{1,2}:\d{2}\s*[AP]M)\b/i);
  if (!timeMatch?.[1]) return '';
  const dayText = findNearestPreviousText(element, '.day-section');
  if (!dayText) return '';

  const normalizedDay = normalizeDateText(dayText);
  const parsed = new Date(`${normalizedDay}, ${referenceDate.getFullYear()} ${timeMatch[1]}`);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  const dayStart = new Date(referenceDate);
  dayStart.setHours(0, 0, 0, 0);
  if (parsed.getTime() < dayStart.getTime() - 24 * 60 * 60 * 1000) {
    parsed.setFullYear(parsed.getFullYear() + 1);
  }

  return parsed.toISOString();
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

const normalizePriceTextValue = (value: string): string => {
  const normalized = normalizeWhitespace(value);
  if (!normalized) return '';
  if (normalized.includes('$')) return normalized;

  const numericAmount = normalized.match(/^([0-9][0-9,]*(?:\.[0-9]{1,2})?)$/);
  if (!numericAmount) return normalized;

  const amount = Number.parseFloat(numericAmount[1].replace(/,/g, ''));
  if (!Number.isFinite(amount)) return normalized;
  return `$${amount.toFixed(2)}`;
};

type LocationParts = {
  venueName: string | null;
  address: string | null;
  city: string | null;
};

const STREET_SUFFIX_PATTERN = [
  'Avenue',
  'Ave',
  'Boulevard',
  'Blvd',
  'Circle',
  'Cir',
  'Court',
  'Ct',
  'Drive',
  'Dr',
  'Lane',
  'Ln',
  'Loop',
  'Parkway',
  'Pkwy',
  'Place',
  'Pl',
  'Road',
  'Rd',
  'Street',
  'St',
  'Way',
].join('|');

const normalizeLocationCity = (value: string | null): string | null => {
  if (!value) return null;
  const city = normalizeWhitespace(value.replace(/\b(?:OR|Oregon|USA|United States)\b\.?/gi, '')).replace(/,\s*$/, '');
  return city.length > 0 ? city : null;
};

export const parseVenueAddressFromLocationText = (value: string): LocationParts => {
  const normalized = normalizeWhitespace(value.replace(/[–—]/g, '-'));
  const streetPattern = new RegExp(
    `\\b(\\d{1,6}\\s+(?:(?:N|NE|NW|S|SE|SW|E|W)\\s+)?[A-Za-z0-9 ']+?\\b(?:${STREET_SUFFIX_PATTERN})(?:\\s*-\\s*[A-Za-z][A-Za-z .]+|\\s+[A-Za-z][A-Za-z .]+)?)`,
    'gi',
  );
  const streetMatches = Array.from(normalized.matchAll(streetPattern));
  const streetMatch = streetMatches[streetMatches.length - 1];
  if (!streetMatch?.[1] || streetMatch.index == null) {
    return { venueName: null, address: null, city: null };
  }

  const venueText = normalized.slice(0, streetMatch.index).replace(/\s*-\s*$/, '').replace(/[.\s]+$/, '');
  const sentenceParts = venueText.split(/\.\s*/).map(normalizeWhitespace).filter(Boolean);
  const venueSentence = sentenceParts[sentenceParts.length - 1] ?? venueText;
  const venueDashParts = venueSentence.split(/\s*-\s*/).map(normalizeWhitespace).filter(Boolean);
  const venueName = venueDashParts[venueDashParts.length - 1]?.replace(/^\d{1,2}:\d{2}\s*[AP]M\s*-\s*/i, '') ?? null;

  let street = normalizeWhitespace(streetMatch[1]);
  let city: string | null = null;
  const dashCity = street.match(/^(.*?)\s*-\s*([A-Za-z][A-Za-z .]+)$/);
  if (dashCity?.[1] && dashCity[2]) {
    street = normalizeWhitespace(dashCity[1]);
    city = normalizeLocationCity(dashCity[2]);
  } else {
    const suffixCityPattern = new RegExp(`^(.*\\b(?:${STREET_SUFFIX_PATTERN})\\b)\\s+([A-Za-z][A-Za-z .]+)$`, 'i');
    const suffixCity = street.match(suffixCityPattern);
    if (suffixCity?.[1] && suffixCity[2]) {
      street = normalizeWhitespace(suffixCity[1]);
      city = normalizeLocationCity(suffixCity[2]);
    }
  }

  const address = city
    ? `${street}, ${city}${/\b(?:OR|Oregon)\b/i.test(city) ? '' : ', OR'}`
    : street;

  return {
    venueName: venueName && venueName.length > 0 ? venueName : null,
    address,
    city: city ? `${city}${/\b(?:OR|Oregon)\b/i.test(city) ? '' : ', OR'}` : null,
  };
};

const cloneElementWithoutExcludedSelectors = (element: Element, mapping: FieldMapping): Element => {
  if (!mapping.excludeSelectors?.length) return element;
  const clone = element.cloneNode(true) as Element;
  mapping.excludeSelectors.forEach((selector) => {
    clone.querySelectorAll(selector).forEach((excludedElement) => excludedElement.remove());
  });
  return clone;
};

const textContentWithBlockSpacing = (element: Element): string => {
  const clone = element.cloneNode(true) as Element;
  clone.querySelectorAll('br, p, li, div, ul, ol, section, article, tr').forEach((blockElement) => {
    blockElement.appendChild(clone.ownerDocument.createTextNode(' '));
  });
  return clone.textContent ?? '';
};

const extractFieldValue = (
  root: Element,
  mapping: FieldMapping,
  baseUrl: string,
  referenceDate: Date,
): string | null => {
  let value = '';
  let element: Element | null = null;
  if (mapping.mode === 'literal') {
    value = mapping.value ?? '';
  } else {
    element = selectElement(root, mapping.selector);
    if (!element) {
      return null;
    }

    const contentElement = cloneElementWithoutExcludedSelectors(element, mapping);
    if (mapping.mode === 'attribute') {
      value = mapping.attribute ? element.getAttribute(mapping.attribute) ?? '' : '';
    } else if (mapping.mode === 'html') {
      value = contentElement.innerHTML;
    } else {
      value = textContentWithBlockSpacing(contentElement);
    }

    if (mapping.transform === 'telerikPostBackUrl') {
      const ownerDocument = element.ownerDocument;
      const elementId = element.getAttribute('id') ?? '';
      value = elementId ? findTelerikPostBackUrl(ownerDocument, elementId, baseUrl) ?? '' : '';
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
  } else if (transform === 'previousDaySectionDateTime') {
    value = parsePreviousDaySectionDateTimeValue(element, value, referenceDate);
  } else if (transform === 'priceText') {
    value = normalizePriceTextValue(value);
  } else if (transform === 'venueFromLocationText') {
    value = parseVenueAddressFromLocationText(value).venueName ?? '';
  } else if (transform === 'addressFromLocationText') {
    value = parseVenueAddressFromLocationText(value).address ?? '';
  } else if (transform === 'cityFromLocationText') {
    value = parseVenueAddressFromLocationText(value).city ?? '';
  } else {
    value = normalizeWhitespace(value);
  }

  return value.length > 0 ? value : null;
};

export const extractAffiliateCandidatesFromPage = (
  page: ScrapedPage,
  mapping: AffiliateScrapeMapping,
): AffiliateCandidateInput[] => {
  const baseUrl = page.finalUrl || page.url;
  if (mapping.manualCandidates?.length) {
    return mapping.manualCandidates.map((manualCandidate, index) => {
      const candidate: AffiliateCandidateInput = {
        listingKind: manualCandidate.listingKind ?? mapping.kind,
        title: manualCandidate.title,
        officialActionUrl: toAbsoluteUrl(manualCandidate.officialActionUrl, baseUrl),
        sourceUrl: toAbsoluteUrl(manualCandidate.sourceUrl ?? manualCandidate.officialActionUrl, baseUrl),
        tags: normalizeTagInputs(manualCandidate.tags ?? manualCandidate.tagText),
        tagText: manualCandidate.tagText ?? null,
        rawPayload: {
          sourceIndex: index,
          manualSummaryCandidate: true,
          extractedFields: manualCandidate,
          tags: normalizeTagInputs(manualCandidate.tags ?? manualCandidate.tagText),
        },
        warnings: manualCandidate.warnings ?? [],
      };

      nullableFieldNames.forEach((fieldName) => {
        const value = manualCandidate[fieldName as keyof typeof manualCandidate];
        if (typeof value === 'string' && value.trim().length > 0) {
          candidate[fieldName] = value.trim();
        }
      });

      return candidate;
    });
  }

  const dom = createDom(page.body, page.finalUrl || page.url);
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
        tags: normalizeTagInputs(fieldValues.tagText),
        tagText: fieldValues.tagText ?? null,
        rawPayload: {
          sourceIndex: index,
          extractedFields: fieldValues,
          tags: normalizeTagInputs(fieldValues.tagText),
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

export const extractAffiliateFieldValuesFromPage = (
  page: ScrapedPage,
  fields: Record<string, FieldMapping>,
): ExtractedAffiliateFieldValues => {
  const baseUrl = page.finalUrl || page.url;
  const dom = createDom(page.body, baseUrl);
  const referenceDate = new Date(page.fetchedAt);
  const effectiveReferenceDate = Number.isNaN(referenceDate.getTime()) ? new Date() : referenceDate;
  const root = dom.window.document.documentElement;
  const fieldValues: ExtractedAffiliateFieldValues = {};

  for (const [fieldName, fieldMapping] of Object.entries(fields)) {
    fieldValues[fieldName] = extractFieldValue(root, fieldMapping, baseUrl, effectiveReferenceDate);
  }

  return fieldValues;
};
