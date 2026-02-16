import { calculateAgeOnDate, formatAgeRange, isAgeWithinRange } from '@/lib/age';
import {
  buildDivisionToken,
  evaluateDivisionAgeEligibility,
  extractDivisionTokenFromId,
  inferDivisionDetails,
  normalizeDivisionGender,
  normalizeDivisionRatingType,
  parseDivisionToken,
} from '@/lib/divisionTypes';
import { prisma } from '@/lib/prisma';

type RegistrationEventContext = {
  id: string;
  start: Date;
  minAge: number | null;
  maxAge: number | null;
  sportId: string | null;
  registrationByDivisionType: boolean | null;
  divisions: string[] | null;
};

type DivisionSelectionInput = {
  divisionId?: string | null;
  divisionTypeId?: string | null;
  divisionTypeKey?: string | null;
};

type EventDivisionOption = {
  id: string;
  key: string;
  name: string;
  sportId: string | null;
  divisionTypeId: string;
  divisionTypeName: string;
  divisionTypeKey: string;
  ratingType: 'AGE' | 'SKILL';
  gender: 'M' | 'F' | 'C';
  ageCutoffDate: string | null;
  ageCutoffLabel: string | null;
  ageCutoffSource: string | null;
};

export type ResolvedDivisionSelection = {
  divisionId: string | null;
  divisionTypeId: string | null;
  divisionTypeKey: string | null;
  divisionName: string | null;
  divisionTypeName: string | null;
  ratingType: 'AGE' | 'SKILL' | null;
  gender: 'M' | 'F' | 'C' | null;
  ageCutoffDate: string | null;
  ageCutoffLabel: string | null;
  ageCutoffSource: string | null;
};

const normalizeKey = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized.length ? normalized : null;
};

const isFiniteNumber = (value: unknown): value is number => (
  typeof value === 'number' && Number.isFinite(value)
);

const hasEventAgeLimits = (event: Pick<RegistrationEventContext, 'minAge' | 'maxAge'>): boolean => (
  isFiniteNumber(event.minAge) || isFiniteNumber(event.maxAge)
);

const matchesDivisionIdentifier = (option: EventDivisionOption, identifier: string): boolean => {
  if (normalizeKey(option.id) === identifier) {
    return true;
  }
  if (normalizeKey(option.key) === identifier) {
    return true;
  }
  if (normalizeKey(option.divisionTypeKey) === identifier) {
    return true;
  }
  if (extractDivisionTokenFromId(option.id) === identifier) {
    return true;
  }
  return false;
};

const pickPreferredOption = (options: EventDivisionOption[]): EventDivisionOption | null => {
  if (!options.length) {
    return null;
  }
  return [...options].sort((left, right) => left.name.localeCompare(right.name))[0] ?? null;
};

const toResolvedSelection = (option: EventDivisionOption | null): ResolvedDivisionSelection => {
  if (!option) {
    return {
      divisionId: null,
      divisionTypeId: null,
      divisionTypeKey: null,
      divisionName: null,
      divisionTypeName: null,
      ratingType: null,
      gender: null,
      ageCutoffDate: null,
      ageCutoffLabel: null,
      ageCutoffSource: null,
    };
  }
  return {
    divisionId: option.id,
    divisionTypeId: option.divisionTypeId,
    divisionTypeKey: option.divisionTypeKey,
    divisionName: option.name,
    divisionTypeName: option.divisionTypeName,
    ratingType: option.ratingType,
    gender: option.gender,
    ageCutoffDate: option.ageCutoffDate,
    ageCutoffLabel: option.ageCutoffLabel,
    ageCutoffSource: option.ageCutoffSource,
  };
};

const buildDivisionOptions = async (
  event: RegistrationEventContext,
): Promise<EventDivisionOption[]> => {
  const eventDivisionIds = Array.isArray(event.divisions)
    ? Array.from(
      new Set(
        event.divisions
          .map((entry) => normalizeKey(entry))
          .filter((entry): entry is string => Boolean(entry)),
      ),
    )
    : [];

  if (!eventDivisionIds.length) {
    return [];
  }

  const rows = await prisma.divisions.findMany({
    where: {
      eventId: event.id,
      OR: [
        { id: { in: eventDivisionIds } },
        { key: { in: eventDivisionIds } },
      ],
    },
    select: {
      id: true,
      key: true,
      name: true,
      sportId: true,
      divisionTypeId: true,
      divisionTypeName: true,
      ratingType: true,
      gender: true,
      ageCutoffDate: true,
      ageCutoffLabel: true,
      ageCutoffSource: true,
    },
  });

  const rowsById = new Map<string, (typeof rows)[number]>();
  const rowsByKey = new Map<string, (typeof rows)[number]>();

  rows.forEach((row) => {
    const rowId = normalizeKey(row.id);
    if (rowId) {
      rowsById.set(rowId, row);
      const token = extractDivisionTokenFromId(rowId);
      if (token) {
        rowsByKey.set(token, row);
      }
    }
    const rowKey = normalizeKey(row.key);
    if (rowKey) {
      rowsByKey.set(rowKey, row);
    }
  });

  const options: EventDivisionOption[] = [];
  const seen = new Set<string>();

  eventDivisionIds.forEach((divisionId) => {
    const row = rowsById.get(divisionId)
      ?? rowsByKey.get(divisionId)
      ?? rowsByKey.get(extractDivisionTokenFromId(divisionId) ?? '')
      ?? null;

    const inferred = inferDivisionDetails({
      identifier: row?.key ?? row?.id ?? divisionId,
      sportInput: row?.sportId ?? event.sportId ?? undefined,
      fallbackName: row?.name ?? undefined,
    });

    const divisionTypeId = normalizeKey(row?.divisionTypeId) ?? inferred.divisionTypeId;
    const ratingType = normalizeDivisionRatingType(row?.ratingType) ?? inferred.ratingType;
    const gender = normalizeDivisionGender(row?.gender) ?? inferred.gender;
    const key = normalizeKey(row?.key) ?? inferred.token;
    const parsedKey = parseDivisionToken(key);
    const divisionTypeKey = parsedKey
      ? key
      : buildDivisionToken({
        gender,
        ratingType,
        divisionTypeId,
      });

    const divisionTypeName = typeof row?.divisionTypeName === 'string' && row.divisionTypeName.trim().length > 0
      ? row.divisionTypeName.trim()
      : inferred.divisionTypeName;

    const ageEligibility = evaluateDivisionAgeEligibility({
      divisionTypeId,
      sportInput: row?.sportId ?? event.sportId ?? undefined,
      referenceDate: event.start,
    });

    const ageCutoffDate = row?.ageCutoffDate instanceof Date && !Number.isNaN(row.ageCutoffDate.getTime())
      ? row.ageCutoffDate.toISOString()
      : (ageEligibility.applies ? ageEligibility.cutoffDate.toISOString() : null);

    const option: EventDivisionOption = {
      id: row?.id ?? divisionId,
      key,
      name: row?.name ?? inferred.defaultName,
      sportId: row?.sportId ?? event.sportId ?? null,
      divisionTypeId,
      divisionTypeName,
      divisionTypeKey,
      ratingType,
      gender,
      ageCutoffDate,
      ageCutoffLabel: row?.ageCutoffLabel ?? ageEligibility.message ?? null,
      ageCutoffSource: row?.ageCutoffSource ?? (ageEligibility.applies ? ageEligibility.cutoffRule.source : null),
    };

    if (seen.has(option.id)) {
      return;
    }
    seen.add(option.id);
    options.push(option);
  });

  return options;
};

export const resolveEventDivisionSelection = async (params: {
  event: RegistrationEventContext;
  input: DivisionSelectionInput;
}): Promise<{
  ok: boolean;
  error?: string;
  selection: ResolvedDivisionSelection;
}> => {
  const options = await buildDivisionOptions(params.event);
  if (!options.length) {
    return { ok: true, selection: toResolvedSelection(null) };
  }

  const normalizedDivisionId = normalizeKey(params.input.divisionId);
  const normalizedTypeId = normalizeKey(params.input.divisionTypeId);
  const normalizedTypeKey = normalizeKey(params.input.divisionTypeKey);
  const byType = Boolean(params.event.registrationByDivisionType);

  const selectedFromDivision = normalizedDivisionId
    ? options.find((option) => matchesDivisionIdentifier(option, normalizedDivisionId)) ?? null
    : null;

  if (normalizedDivisionId && !selectedFromDivision) {
    return {
      ok: false,
      error: 'Selected division is not available for this event.',
      selection: toResolvedSelection(null),
    };
  }

  if (!byType) {
    const selected = selectedFromDivision ?? (options.length === 1 ? options[0] : null);
    if (!selected) {
      return {
        ok: false,
        error: 'Select a division to register for this event.',
        selection: toResolvedSelection(null),
      };
    }
    return { ok: true, selection: toResolvedSelection(selected) };
  }

  const fallbackTypeKey = selectedFromDivision?.divisionTypeKey ?? null;
  const fallbackTypeId = selectedFromDivision?.divisionTypeId ?? null;
  let requestedTypeKey = normalizedTypeKey ?? fallbackTypeKey;
  let requestedTypeId = normalizedTypeId ?? fallbackTypeId;

  if (!requestedTypeKey && !requestedTypeId) {
    const distinctTypeKeys = Array.from(new Set(options.map((option) => option.divisionTypeKey)));
    if (distinctTypeKeys.length === 1) {
      requestedTypeKey = distinctTypeKeys[0];
    } else {
      return {
        ok: false,
        error: 'Select a division type to register for this event.',
        selection: toResolvedSelection(null),
      };
    }
  }

  let candidates = options.filter((option) => (
    (requestedTypeKey && option.divisionTypeKey === requestedTypeKey)
    || (requestedTypeId && option.divisionTypeId === requestedTypeId)
  ));

  if (!candidates.length) {
    return {
      ok: false,
      error: 'Selected division type is not available for this event.',
      selection: toResolvedSelection(null),
    };
  }

  const selected = selectedFromDivision && candidates.some((option) => option.id === selectedFromDivision.id)
    ? selectedFromDivision
    : pickPreferredOption(candidates);

  if (!selected) {
    return {
      ok: false,
      error: 'Unable to determine a division for this registration.',
      selection: toResolvedSelection(null),
    };
  }

  return { ok: true, selection: toResolvedSelection(selected) };
};

export const validateRegistrantAgeForSelection = (params: {
  dateOfBirth: Date;
  event: RegistrationEventContext;
  selection: ResolvedDivisionSelection;
}): {
  ageAtEvent: number;
  error?: string;
} => {
  const ageAtEvent = calculateAgeOnDate(params.dateOfBirth, params.event.start);
  if (!Number.isFinite(ageAtEvent)) {
    return { ageAtEvent, error: 'Invalid date of birth' };
  }

  if (hasEventAgeLimits(params.event)) {
    if (!isAgeWithinRange(ageAtEvent, params.event.minAge, params.event.maxAge)) {
      return {
        ageAtEvent,
        error: `This event is limited to ages ${formatAgeRange(params.event.minAge, params.event.maxAge)}.`,
      };
    }
    return { ageAtEvent };
  }

  if (!params.selection.divisionTypeId) {
    return { ageAtEvent };
  }

  const divisionEligibility = evaluateDivisionAgeEligibility({
    dateOfBirth: params.dateOfBirth,
    divisionTypeId: params.selection.divisionTypeId,
    sportInput: params.event.sportId ?? undefined,
    referenceDate: params.event.start,
  });

  if (divisionEligibility.applies && divisionEligibility.eligible === false) {
    return {
      ageAtEvent,
      error: divisionEligibility.message
        ? `This division requires: ${divisionEligibility.message}.`
        : 'Registrant is not age-eligible for the selected division.',
    };
  }

  return { ageAtEvent };
};

export const inferTeamDivisionTypeId = (team: {
  divisionTypeId?: string | null;
  division?: unknown;
  sport?: string | null;
}): string | null => {
  const explicit = normalizeKey(team.divisionTypeId);
  if (explicit) {
    return explicit;
  }

  if (typeof team.division === 'string' && team.division.trim().length > 0) {
    return inferDivisionDetails({
      identifier: team.division,
      sportInput: team.sport ?? undefined,
    }).divisionTypeId;
  }

  if (team.division && typeof team.division === 'object') {
    const row = team.division as Record<string, unknown>;
    const fromType = normalizeKey(row.divisionTypeId);
    if (fromType) {
      return fromType;
    }
    const identifier = normalizeKey(row.id) ?? normalizeKey(row.key) ?? normalizeKey(row.name);
    if (identifier) {
      return inferDivisionDetails({
        identifier,
        sportInput: team.sport ?? undefined,
      }).divisionTypeId;
    }
  }

  return null;
};
