import { JSDOM, VirtualConsole } from 'jsdom';
import {
  normalizeAffiliateEventDateTime,
} from './affiliateDateTime';
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
  'locationSource',
  'locationEvidence',
  'startsAt',
  'endsAt',
  'durationText',
  'timeZone',
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
  if (transform === 'dateTime' || transform === 'dateRangeEnd' || transform === 'previousDaySectionDateTime') {
    return normalizeWhitespace(value) || null;
  }

  if (transform === 'absoluteUrl') {
    value = toAbsoluteUrl(normalizeWhitespace(value), baseUrl);
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

const normalizeExtractedDateTimeFields = (params: {
  fieldValues: Partial<Record<ExtractedFieldName, string | null>>;
  fieldMappings: AffiliateScrapeMapping['fields'];
  fieldElements: Partial<Record<ExtractedFieldName, Element | null>>;
  referenceDate: Date;
}) => {
  const { fieldValues, fieldMappings, fieldElements, referenceDate } = params;
  const rawStartsAt = fieldValues.startsAt ?? null;
  const rawEndsAt = fieldValues.endsAt ?? null;
  const rawDurationText = fieldValues.durationText ?? null;
  const rawTimeZone = fieldValues.timeZone ?? null;
  const startElement = fieldElements.startsAt ?? null;
  const startMapping = fieldMappings.startsAt;
  let startSource = rawStartsAt;

  if (startMapping?.transform === 'previousDaySectionDateTime' && startElement && rawStartsAt) {
    const dayText = findNearestPreviousText(startElement, '.day-section');
    if (dayText) startSource = `${dayText} ${rawStartsAt}`;
  }

  const normalized = normalizeAffiliateEventDateTime({
    startsAt: startSource,
    endsAt: rawEndsAt,
    durationText: rawDurationText,
    timeZone: rawTimeZone,
    dateDisplayMode: fieldValues.dateDisplayMode ?? null,
    referenceDate,
  });

  if (rawStartsAt) fieldValues.startsAt = normalized.startsAt;
  if (normalized.endsAt || rawEndsAt) {
    fieldValues.endsAt = normalized.endsAt;
  }
  if (rawTimeZone) fieldValues.timeZone = normalized.metadata.timeZone;
  if (normalized.dateDisplayMode) fieldValues.dateDisplayMode = normalized.dateDisplayMode;

  return {
    normalized,
    dateTimeInputs: {
      startsAt: startSource,
      endsAt: rawEndsAt,
      durationText: rawDurationText,
      timeZone: rawTimeZone,
      dateDisplayMode: fieldValues.dateDisplayMode ?? null,
    },
  };
};

const isStaleMissingTimeZoneWarning = (warning: string): boolean => (
  warning === 'timeZone:MISSING_IANA_TIME_ZONE'
  || warning === 'start:MISSING_TIME_ZONE'
  || warning === 'end:MISSING_TIME_ZONE'
);

const recordValue = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const stringOrNull = (value: unknown): string | null => (
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
);

/**
 * Re-run datetime normalization after the service resolves a candidate's
 * venue or source-organization coordinates to an IANA timezone.
 */
export const normalizeAffiliateCandidateDateTime = (
  candidate: AffiliateCandidateInput,
  params: {
    timeZone?: string | null;
    timeZoneEvidence?: 'SOURCE_FIELD' | 'COORDINATES';
    referenceDate: Date;
    dateTimeInputs?: Record<string, unknown>;
  },
): AffiliateCandidateInput => {
  const rawPayload = recordValue(candidate.rawPayload);
  const dateTimeInputs = recordValue(rawPayload.dateTimeInputs);
  const rawExtractedFields = recordValue(rawPayload.rawExtractedFields);
  const overrides = params.dateTimeInputs ?? {};
  const hasInput = (fieldName: string): boolean => (
    Object.prototype.hasOwnProperty.call(overrides, fieldName)
    || Object.prototype.hasOwnProperty.call(dateTimeInputs, fieldName)
    || Object.prototype.hasOwnProperty.call(rawExtractedFields, fieldName)
  );
  const inputValue = (fieldName: string, fallback: unknown): unknown => (
    Object.prototype.hasOwnProperty.call(overrides, fieldName)
      ? overrides[fieldName]
      : fallback
  );
  const startsAt = stringOrNull(inputValue('startsAt', dateTimeInputs.startsAt ?? rawExtractedFields.startsAt));
  const endsAt = stringOrNull(inputValue('endsAt', dateTimeInputs.endsAt ?? rawExtractedFields.endsAt));
  const durationText = stringOrNull(inputValue(
    'durationText',
    dateTimeInputs.durationText ?? rawExtractedFields.durationText,
  ));
  const dateDisplayMode = stringOrNull(inputValue(
    'dateDisplayMode',
    dateTimeInputs.dateDisplayMode ?? candidate.dateDisplayMode,
  ));
  const timeZone = stringOrNull(inputValue(
    'timeZone',
    params.timeZone ?? candidate.timeZone,
  ));
  const existingDateTimeMetadata = recordValue(recordValue(rawPayload.normalizedImport).dateTime);
  const timeZoneEvidence = params.timeZoneEvidence
    ?? (existingDateTimeMetadata.timeZoneEvidence === 'COORDINATES'
      ? 'COORDINATES'
      : params.timeZone
        ? 'COORDINATES'
        : 'SOURCE_FIELD');
  const normalized = normalizeAffiliateEventDateTime({
    startsAt,
    endsAt,
    durationText,
    timeZone,
    timeZoneEvidence,
    dateDisplayMode,
    referenceDate: params.referenceDate,
  });
  const nextCandidate: AffiliateCandidateInput = {
    ...candidate,
    timeZone: normalized.metadata.timeZone,
    warnings: [
      ...(candidate.warnings ?? []).filter((warning) => !isStaleMissingTimeZoneWarning(warning)),
      ...normalized.metadata.warnings,
    ],
    rawPayload: {
      ...rawPayload,
      dateTimeInputs: {
        ...dateTimeInputs,
        ...overrides,
      },
      extractedFields: {
        ...recordValue(rawPayload.extractedFields),
        startsAt: normalized.startsAt,
        endsAt: normalized.endsAt,
        durationText,
        timeZone: normalized.metadata.timeZone,
        dateDisplayMode: normalized.dateDisplayMode,
      },
      normalizedImport: {
        ...recordValue(rawPayload.normalizedImport),
        dateTime: normalized.metadata,
      },
    },
  };

  if (hasInput('startsAt')) nextCandidate.startsAt = normalized.startsAt;
  if (hasInput('startsAt') || hasInput('endsAt')) nextCandidate.endsAt = normalized.endsAt;
  if (normalized.dateDisplayMode) nextCandidate.dateDisplayMode = normalized.dateDisplayMode;
  return nextCandidate;
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
          dateTimeInputs: {
            startsAt: manualCandidate.startsAt ?? null,
            endsAt: manualCandidate.endsAt ?? null,
            durationText: manualCandidate.durationText ?? null,
            timeZone: manualCandidate.timeZone ?? null,
            dateDisplayMode: manualCandidate.dateDisplayMode ?? null,
          },
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
      if (Array.isArray(manualCandidate.sportNames)) {
        candidate.sportNames = manualCandidate.sportNames.map((value) => value.trim()).filter(Boolean);
      }

      const normalizedDateTime = normalizeAffiliateEventDateTime({
        startsAt: manualCandidate.startsAt ?? null,
        endsAt: manualCandidate.endsAt ?? null,
        durationText: manualCandidate.durationText ?? null,
        timeZone: manualCandidate.timeZone ?? null,
        dateDisplayMode: manualCandidate.dateDisplayMode ?? null,
        referenceDate: new Date(page.fetchedAt),
      });
      if (manualCandidate.startsAt != null) candidate.startsAt = normalizedDateTime.startsAt;
      if (manualCandidate.endsAt != null || normalizedDateTime.endsAt != null) {
        candidate.endsAt = normalizedDateTime.endsAt;
      }
      if (manualCandidate.timeZone != null) candidate.timeZone = normalizedDateTime.metadata.timeZone;
      if (normalizedDateTime.dateDisplayMode) candidate.dateDisplayMode = normalizedDateTime.dateDisplayMode;
      candidate.warnings = [...(candidate.warnings ?? []), ...normalizedDateTime.metadata.warnings];
      (candidate.rawPayload as Record<string, unknown>).normalizedImport = {
        dateTime: normalizedDateTime.metadata,
      };
      (candidate.rawPayload as Record<string, unknown>).dateTimeInputs = {
        startsAt: manualCandidate.startsAt ?? null,
        endsAt: manualCandidate.endsAt ?? null,
        durationText: manualCandidate.durationText ?? null,
        timeZone: manualCandidate.timeZone ?? null,
        dateDisplayMode: manualCandidate.dateDisplayMode ?? null,
      };

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
      const fieldElements: Partial<Record<ExtractedFieldName, Element | null>> = {};

      for (const [fieldName, fieldMapping] of Object.entries(mapping.fields) as Array<[ExtractedFieldName, FieldMapping]>) {
        const value = extractFieldValue(element, fieldMapping, baseUrl, effectiveReferenceDate);
        if (!value && fieldMapping.required) {
          warnings.push(`Missing required field: ${fieldName}`);
        }
        fieldValues[fieldName] = value;
        fieldElements[fieldName] = selectElement(element, fieldMapping.selector);
      }

      const rawFieldValues = { ...fieldValues };
      const dateTimeResult = normalizeExtractedDateTimeFields({
        fieldValues,
        fieldMappings: mapping.fields,
        fieldElements,
        referenceDate: effectiveReferenceDate,
      });
      warnings.push(...dateTimeResult.normalized.metadata.warnings);

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
          rawExtractedFields: rawFieldValues,
          dateTimeInputs: dateTimeResult.dateTimeInputs,
          normalizedImport: {
            dateTime: dateTimeResult.normalized.metadata,
          },
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
      const sportNamesValue = fieldValues.sportNames;
      if (sportNamesValue) {
        candidate.sportNames = sportNamesValue
          .split(/[,;|]/)
          .map((value) => normalizeWhitespace(value))
          .filter(Boolean);
      }

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
