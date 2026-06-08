import React, { useCallback, useMemo } from 'react';
import { Badge, Button, Group, NumberInput, SimpleGrid, Stack, Switch, TagsInput, Text } from '@mantine/core';

import type {
  EventOfficialPosition,
  MatchIncidentCardColor,
  MatchIncidentDefinitionKind,
  MatchIncidentTypeDefinition,
  MatchRulesConfig,
  MatchTimekeepingConfig,
  MatchTimerMode,
  ResolvedMatchRules,
  ResolvedMatchTimekeepingConfig,
  Sport,
} from '@/types';

const DEFAULT_POINT_INCIDENT_TYPE = 'POINT';
const DEFAULT_INCIDENT_TYPES = [DEFAULT_POINT_INCIDENT_TYPE, 'DISCIPLINE', 'NOTE', 'ADMIN'] as const;
const SCORING_INCIDENT_TYPES = new Set(['POINT', 'GOAL', 'RUN', 'SCORE']);

type MatchRulesSectionProps = {
  sport?: Sport | null;
  usesSets?: boolean | null;
  setsPerMatch?: number | null;
  winnerSetCount?: number | null;
  officialPositions?: EventOfficialPosition[] | null;
  value?: MatchRulesConfig | null;
  onChange: (next: MatchRulesConfig | null) => void;
  autoCreatePointMatchIncidents: boolean;
  onAutoCreatePointMatchIncidentsChange: (checked: boolean) => void;
  disabled?: boolean;
  incidentToggleDisabled?: boolean;
  comboboxProps?: Record<string, unknown>;
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const normalizePositiveInt = (value: unknown): number | undefined => {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return undefined;
  }
  return Math.max(1, Math.trunc(numeric));
};

const normalizeStringList = (value: unknown): string[] => (
  Array.isArray(value)
    ? Array.from(new Set(value.map((entry) => String(entry).trim()).filter(Boolean)))
    : []
);

const normalizeIncidentCode = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return normalized || null;
};

const normalizeIncidentCodeList = (value: unknown): string[] => (
  normalizeStringList(value)
    .map((entry) => normalizeIncidentCode(entry))
    .filter((entry): entry is string => Boolean(entry))
);

const normalizeIncidentLabelKey = (value: unknown): string => String(value ?? '').trim().toLowerCase();

const incidentTypeLabel = (value: string): string => {
  const normalized = normalizeIncidentCode(value) ?? value;
  switch (normalized) {
    case 'POINT':
      return 'Point';
    case 'GOAL':
      return 'Goal';
    case 'RUN':
      return 'Run';
    case 'DISCIPLINE':
      return 'Penalty or card';
    case 'NOTE':
      return 'Match note';
    case 'ADMIN':
      return 'Admin note';
    default:
      return normalized
        .trim()
        .toLowerCase()
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (character) => character.toUpperCase());
  }
};

const incidentKindForCode = (code: string): MatchIncidentDefinitionKind => {
  if (SCORING_INCIDENT_TYPES.has(code)) return 'SCORING';
  if (code === 'NOTE') return 'NOTE';
  if (code === 'ADMIN') return 'ADMIN';
  return 'DISCIPLINE';
};

const normalizeIncidentKind = (value: unknown, fallback: MatchIncidentDefinitionKind): MatchIncidentDefinitionKind => {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (normalized === 'SCORING' || normalized === 'DISCIPLINE' || normalized === 'NOTE' || normalized === 'ADMIN') {
    return normalized;
  }
  return fallback;
};

const normalizeCardColor = (value: unknown): MatchIncidentCardColor | null => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (normalized === 'yellow' || normalized === 'red' || normalized === 'blue') return normalized;
  return null;
};

const incidentDefinitionForCode = (
  code: string,
  overrides: Partial<MatchIncidentTypeDefinition> = {},
): MatchIncidentTypeDefinition => {
  const normalizedCode = normalizeIncidentCode(code) ?? DEFAULT_POINT_INCIDENT_TYPE;
  const kind = normalizeIncidentKind(overrides.kind, incidentKindForCode(normalizedCode));
  const cardColor = normalizeCardColor(overrides.cardColor);
  return {
    code: normalizedCode,
    label: typeof overrides.label === 'string' && overrides.label.trim()
      ? overrides.label.trim()
      : incidentTypeLabel(normalizedCode),
    kind,
    ...(cardColor ? { cardColor } : {}),
    requiresTeam: typeof overrides.requiresTeam === 'boolean' ? overrides.requiresTeam : kind === 'SCORING',
    requiresParticipant: overrides.requiresParticipant === true,
    defaultEnabled: overrides.defaultEnabled !== false,
    linkedPointDelta: typeof overrides.linkedPointDelta === 'number' && Number.isFinite(overrides.linkedPointDelta)
      ? Math.trunc(overrides.linkedPointDelta)
      : kind === 'SCORING'
        ? 1
        : null,
    metadata: isRecord(overrides.metadata) ? { ...overrides.metadata } : null,
  };
};

const normalizeIncidentDefinition = (value: unknown): MatchIncidentTypeDefinition | null => {
  if (!isRecord(value)) return null;
  const code = normalizeIncidentCode(value.code);
  if (!code) return null;
  return incidentDefinitionForCode(code, value as Partial<MatchIncidentTypeDefinition>);
};

const mergeIncidentDefinitions = (...sources: unknown[]): MatchIncidentTypeDefinition[] => {
  const byCode = new Map<string, MatchIncidentTypeDefinition>();
  const addDefinition = (definition: MatchIncidentTypeDefinition) => {
    const previous = byCode.get(definition.code);
    byCode.set(definition.code, previous ? { ...previous, ...definition, code: previous.code } : definition);
  };
  DEFAULT_INCIDENT_TYPES.forEach((code) => addDefinition(incidentDefinitionForCode(code)));
  sources.forEach((source) => {
    if (!Array.isArray(source)) return;
    source.forEach((entry) => {
      const definition = normalizeIncidentDefinition(entry);
      if (definition) addDefinition(definition);
    });
  });
  return Array.from(byCode.values());
};

const normalizeTimerMode = (value: unknown, fallback: MatchTimerMode): MatchTimerMode => {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return normalized === 'COUNT_UP' || normalized === 'NONE' ? normalized : fallback;
};

const normalizeTimekeepingConfig = (value: unknown): MatchTimekeepingConfig => {
  if (!isRecord(value)) return {};
  const segmentDurationMinutes = normalizePositiveInt(value.segmentDurationMinutes);
  const sequenceDurations = Array.isArray(value.segmentDurationMinutesBySequence)
    ? value.segmentDurationMinutesBySequence
        .map((entry) => normalizePositiveInt(entry))
        .filter((entry): entry is number => typeof entry === 'number')
    : [];
  return {
    ...(typeof value.timerMode === 'string' ? { timerMode: normalizeTimerMode(value.timerMode, 'NONE') } : {}),
    ...(segmentDurationMinutes ? { segmentDurationMinutes } : value.segmentDurationMinutes === null ? { segmentDurationMinutes: null } : {}),
    ...(sequenceDurations.length ? { segmentDurationMinutesBySequence: sequenceDurations } : {}),
    ...(typeof value.canUseAddedTime === 'boolean' ? { canUseAddedTime: value.canUseAddedTime } : {}),
    ...(typeof value.addedTimeEnabled === 'boolean' ? { addedTimeEnabled: value.addedTimeEnabled } : {}),
    ...(typeof value.stopAtRegulationEnd === 'boolean' ? { stopAtRegulationEnd: value.stopAtRegulationEnd } : {}),
  };
};

const normalizeRulesConfig = (
  value: MatchRulesConfig | null | undefined,
  options: { preserveSegmentCount?: boolean } = {},
): MatchRulesConfig => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const normalized: MatchRulesConfig = {};
  const scoringModel = typeof value.scoringModel === 'string'
    ? value.scoringModel.trim().toUpperCase()
    : '';
  if (scoringModel === 'SETS' || scoringModel === 'PERIODS' || scoringModel === 'INNINGS' || scoringModel === 'POINTS_ONLY') {
    normalized.scoringModel = scoringModel;
  }
  if (typeof value.segmentLabel === 'string' && value.segmentLabel.trim()) {
    normalized.segmentLabel = value.segmentLabel.trim();
  }
  if (options.preserveSegmentCount) {
    const segmentCount = normalizePositiveInt(value.segmentCount);
    if (segmentCount) {
      normalized.segmentCount = segmentCount;
    }
  }
  if (typeof value.supportsDraw === 'boolean') {
    normalized.supportsDraw = value.supportsDraw;
  }
  if (typeof value.supportsOvertime === 'boolean') {
    normalized.supportsOvertime = value.supportsOvertime;
  }
  if (typeof value.supportsShootout === 'boolean') {
    normalized.supportsShootout = value.supportsShootout;
  }
  if (typeof value.canUseOvertime === 'boolean') {
    normalized.canUseOvertime = value.canUseOvertime;
  }
  if (typeof value.canUseShootout === 'boolean') {
    normalized.canUseShootout = value.canUseShootout;
  }
  const officialRoles = normalizeStringList(value.officialRoles);
  if (officialRoles.length > 0) {
    normalized.officialRoles = officialRoles;
  }
  const supportedIncidentTypes = normalizeIncidentCodeList(value.supportedIncidentTypes);
  if (supportedIncidentTypes.length > 0) {
    normalized.supportedIncidentTypes = supportedIncidentTypes;
  }
  const incidentTypeDefinitions = mergeIncidentDefinitions(value.incidentTypeDefinitions);
  if (incidentTypeDefinitions.length > DEFAULT_INCIDENT_TYPES.length || Array.isArray(value.incidentTypeDefinitions)) {
    normalized.incidentTypeDefinitions = incidentTypeDefinitions;
  }
  if (typeof value.autoCreatePointIncidentType === 'string' && value.autoCreatePointIncidentType.trim()) {
    normalized.autoCreatePointIncidentType = normalizeIncidentCode(value.autoCreatePointIncidentType) ?? value.autoCreatePointIncidentType.trim();
  }
  const timekeeping = normalizeTimekeepingConfig(value.timekeeping);
  if (Object.keys(timekeeping).length > 0) {
    normalized.timekeeping = timekeeping;
  }
  return normalized;
};

const segmentLabelForModel = (model: ResolvedMatchRules['scoringModel']): string => {
  switch (model) {
    case 'SETS':
      return 'Set';
    case 'INNINGS':
      return 'Inning';
    case 'POINTS_ONLY':
      return 'Total';
    case 'PERIODS':
    default:
      return 'Period';
  }
};

const areSameStringSet = (left: string[], right: string[]): boolean => {
  if (left.length !== right.length) {
    return false;
  }
  const leftSet = new Set(left);
  return right.every((value) => leftSet.has(value));
};

const resolveScoringModel = (
  value: unknown,
  fallback: ResolvedMatchRules['scoringModel'],
): ResolvedMatchRules['scoringModel'] => {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (normalized === 'SETS' || normalized === 'PERIODS' || normalized === 'INNINGS' || normalized === 'POINTS_ONLY') {
    return normalized;
  }
  return fallback;
};

const resolveTimekeeping = (params: {
  scoringModel: ResolvedMatchRules['scoringModel'];
  segmentCount: number;
  sportTemplate: MatchRulesConfig;
  eventOverride: MatchRulesConfig;
}): ResolvedMatchTimekeepingConfig => {
  const sportTimekeeping = normalizeTimekeepingConfig(params.sportTemplate.timekeeping);
  const eventTimekeeping = normalizeTimekeepingConfig(params.eventOverride.timekeeping);
  const merged = { ...sportTimekeeping, ...eventTimekeeping };
  const fallbackMode: MatchTimerMode = sportTimekeeping.timerMode ?? (params.scoringModel === 'PERIODS' ? 'COUNT_UP' : 'NONE');
  const timerMode = normalizeTimerMode(merged.timerMode, fallbackMode);
  const segmentDurationMinutes = normalizePositiveInt(merged.segmentDurationMinutes) ?? null;
  const canUseAddedTime = timerMode !== 'NONE' && sportTimekeeping.canUseAddedTime === true;
  const addedTimeEnabled = canUseAddedTime && merged.addedTimeEnabled === true;
  return {
    timerMode,
    segmentDurationMinutes,
    segmentDurationMinutesBySequence: Array.isArray(merged.segmentDurationMinutesBySequence)
      ? merged.segmentDurationMinutesBySequence
          .map((entry) => normalizePositiveInt(entry))
          .filter((entry): entry is number => typeof entry === 'number')
      : [],
    canUseAddedTime,
    addedTimeEnabled,
    stopAtRegulationEnd: timerMode === 'NONE'
      ? true
      : addedTimeEnabled
        ? false
        : typeof merged.stopAtRegulationEnd === 'boolean'
          ? merged.stopAtRegulationEnd
          : true,
  };
};

const resolveMatchRules = (params: {
  sportTemplate?: MatchRulesConfig | null;
  eventOverride?: MatchRulesConfig | null;
  autoCreatePointMatchIncidents?: boolean;
  usesSets?: boolean | null;
  setsPerMatch?: number | null;
  winnerSetCount?: number | null;
  officialPositions?: EventOfficialPosition[] | null;
}): ResolvedMatchRules => {
  const sportTemplate = normalizeRulesConfig(params.sportTemplate, { preserveSegmentCount: true });
  const eventOverride = normalizeRulesConfig(params.eventOverride);
  const merged: MatchRulesConfig = { ...sportTemplate, ...eventOverride };
  const hasSportTemplate = Object.keys(sportTemplate).length > 0;
  const fallbackModel: ResolvedMatchRules['scoringModel'] = params.usesSets ? 'SETS' : 'POINTS_ONLY';
  const scoringModel = resolveScoringModel(merged.scoringModel, fallbackModel);
  const fallbackSegmentCount = scoringModel === 'SETS'
    ? normalizePositiveInt(params.setsPerMatch ?? params.winnerSetCount) ?? 1
    : 1;
  const segmentCount = normalizePositiveInt(merged.segmentCount) ?? fallbackSegmentCount;
  const officialRolesFromPositions = (params.officialPositions ?? [])
    .map((position) => position.name.trim())
    .filter(Boolean);
  const officialRoles = normalizeStringList(merged.officialRoles);
  const autoCreatePointIncidentType = typeof merged.autoCreatePointIncidentType === 'string' && merged.autoCreatePointIncidentType.trim()
    ? normalizeIncidentCode(merged.autoCreatePointIncidentType) ?? DEFAULT_POINT_INCIDENT_TYPE
    : DEFAULT_POINT_INCIDENT_TYPE;
  const incidentTypeDefinitions = mergeIncidentDefinitions(
    sportTemplate.incidentTypeDefinitions,
    eventOverride.incidentTypeDefinitions,
    [incidentDefinitionForCode(autoCreatePointIncidentType, { kind: 'SCORING', requiresTeam: true, linkedPointDelta: 1 })],
  );
  const supportedIncidentTypes = normalizeIncidentCodeList(merged.supportedIncidentTypes);
  const canUseOvertime = hasSportTemplate
    ? sportTemplate.canUseOvertime === true || sportTemplate.supportsOvertime === true
    : eventOverride.canUseOvertime === true || eventOverride.supportsOvertime === true;
  const canUseShootout = hasSportTemplate
    ? sportTemplate.canUseShootout === true || sportTemplate.supportsShootout === true
    : eventOverride.canUseShootout === true || eventOverride.supportsShootout === true;
  const supportsOvertime = canUseOvertime && merged.supportsOvertime === true;
  const supportsShootout = canUseShootout && merged.supportsShootout === true;

  return {
    scoringModel,
    segmentCount,
    segmentLabel: typeof merged.segmentLabel === 'string' && merged.segmentLabel.trim()
      ? merged.segmentLabel.trim()
      : segmentLabelForModel(scoringModel),
    supportsDraw: merged.supportsDraw === true && !supportsShootout,
    supportsOvertime,
    supportsShootout,
    canUseOvertime,
    canUseShootout,
    officialRoles: officialRoles.length > 0 ? officialRoles : officialRolesFromPositions,
    supportedIncidentTypes: supportedIncidentTypes.length
      ? supportedIncidentTypes
      : incidentTypeDefinitions.filter((definition) => definition.defaultEnabled !== false).map((definition) => definition.code),
    incidentTypeDefinitions,
    autoCreatePointIncidentType,
    pointIncidentRequiresParticipant: params.autoCreatePointMatchIncidents === true,
    timekeeping: resolveTimekeeping({
      scoringModel,
      segmentCount,
      sportTemplate,
      eventOverride,
    }),
  };
};

const emptyTimekeeping = (value?: MatchTimekeepingConfig): boolean => (
  !value || Object.keys(value).length === 0
);

const timekeepingLabelForSegment = (segmentLabel: string): string => {
  const lower = segmentLabel.toLowerCase();
  return lower === 'total' ? 'Match length' : `${segmentLabel} length`;
};

const cardBadgeColor = (color?: MatchIncidentCardColor | null): string => {
  if (color === 'yellow') return 'yellow';
  if (color === 'red') return 'red';
  if (color === 'blue') return 'blue';
  return 'gray';
};

const displayValueForIncidentDefinition = (definition: MatchIncidentTypeDefinition): string => (
  definition.label?.trim() || incidentTypeLabel(definition.code)
);

export default function MatchRulesSection({
  sport,
  usesSets,
  setsPerMatch,
  winnerSetCount,
  officialPositions,
  value,
  onChange,
  autoCreatePointMatchIncidents,
  onAutoCreatePointMatchIncidentsChange,
  disabled = false,
  incidentToggleDisabled = false,
  comboboxProps,
}: MatchRulesSectionProps) {
  const baseRules = useMemo(
    () => resolveMatchRules({
      sportTemplate: sport?.matchRulesTemplate ?? null,
      autoCreatePointMatchIncidents,
      usesSets,
      setsPerMatch,
      winnerSetCount,
      officialPositions,
    }),
    [autoCreatePointMatchIncidents, officialPositions, setsPerMatch, sport?.matchRulesTemplate, usesSets, winnerSetCount],
  );
  const resolvedRules = useMemo(
    () => resolveMatchRules({
      sportTemplate: sport?.matchRulesTemplate ?? null,
      eventOverride: value ?? null,
      autoCreatePointMatchIncidents,
      usesSets,
      setsPerMatch,
      winnerSetCount,
      officialPositions,
    }),
    [autoCreatePointMatchIncidents, officialPositions, setsPerMatch, sport?.matchRulesTemplate, usesSets, value, winnerSetCount],
  );
  const normalizedOverride = useMemo(() => normalizeRulesConfig(value), [value]);
  const hasOverrides = Object.keys(normalizedOverride).length > 0;
  const autoPointIncidentType = resolvedRules.autoCreatePointIncidentType?.trim() || DEFAULT_POINT_INCIDENT_TYPE;
  const incidentDefinitionsByCode = useMemo(() => (
    new Map(resolvedRules.incidentTypeDefinitions.map((definition) => [definition.code, definition]))
  ), [resolvedRules.incidentTypeDefinitions]);
  const baseIncidentDefinitionsByCode = useMemo(() => (
    new Map([
      ...baseRules.incidentTypeDefinitions.map((definition) => [definition.code, definition] as const),
      ...DEFAULT_INCIDENT_TYPES.map((code) => [code, incidentDefinitionForCode(code)] as const),
    ])
  ), [baseRules.incidentTypeDefinitions]);
  const availableIncidentTypes = useMemo(() => (
    Array.from(
      new Set([
        ...DEFAULT_INCIDENT_TYPES,
        ...baseRules.supportedIncidentTypes,
        ...resolvedRules.supportedIncidentTypes,
        ...baseRules.incidentTypeDefinitions.map((definition) => definition.code),
        ...resolvedRules.incidentTypeDefinitions.map((definition) => definition.code),
      ]),
    )
  ), [baseRules.incidentTypeDefinitions, baseRules.supportedIncidentTypes, resolvedRules.incidentTypeDefinitions, resolvedRules.supportedIncidentTypes]);
  const selectedIncidentTypes = useMemo(() => (
    autoCreatePointMatchIncidents
      ? resolvedRules.supportedIncidentTypes
      : resolvedRules.supportedIncidentTypes.filter((incidentType) => incidentType !== autoPointIncidentType)
  ), [autoCreatePointMatchIncidents, autoPointIncidentType, resolvedRules.supportedIncidentTypes]);
  const selectedDefinitions = selectedIncidentTypes.map((type) => (
    incidentDefinitionsByCode.get(type) ?? incidentDefinitionForCode(type)
  ));
  const selectedIncidentDisplayValues = useMemo(
    () => selectedDefinitions.map(displayValueForIncidentDefinition),
    [selectedDefinitions],
  );

  const updateOverride = useCallback((updater: (draft: MatchRulesConfig) => void) => {
    const draft = normalizeRulesConfig(normalizedOverride);
    updater(draft);
    if (emptyTimekeeping(draft.timekeeping)) {
      delete draft.timekeeping;
    }
    const next = normalizeRulesConfig(draft);
    onChange(Object.keys(next).length > 0 ? next : null);
  }, [normalizedOverride, onChange]);

  const setBooleanOverride = useCallback((
    key: 'supportsOvertime' | 'supportsShootout',
    checked: boolean,
    defaultValue: boolean,
  ) => {
    updateOverride((draft) => {
      if (checked === defaultValue) {
        delete draft[key];
      } else {
        draft[key] = checked;
      }
    });
  }, [updateOverride]);

  const updateTimekeepingOverride = useCallback((updater: (draft: MatchTimekeepingConfig) => void) => {
    updateOverride((draft) => {
      const timekeeping = normalizeTimekeepingConfig(draft.timekeeping);
      updater(timekeeping);
      draft.timekeeping = timekeeping;
    });
  }, [updateOverride]);

  const handleSegmentDurationChange = useCallback((value: string | number) => {
    const nextDuration = normalizePositiveInt(value);
    updateTimekeepingOverride((draft) => {
      if (!nextDuration || nextDuration === baseRules.timekeeping.segmentDurationMinutes) {
        delete draft.segmentDurationMinutes;
      } else {
        draft.segmentDurationMinutes = nextDuration;
      }
    });
  }, [baseRules.timekeeping.segmentDurationMinutes, updateTimekeepingOverride]);

  const handleAddedTimeChange = useCallback((checked: boolean) => {
    updateTimekeepingOverride((draft) => {
      if (checked === baseRules.timekeeping.addedTimeEnabled) {
        delete draft.addedTimeEnabled;
        delete draft.stopAtRegulationEnd;
      } else {
        draft.addedTimeEnabled = checked;
        draft.stopAtRegulationEnd = !checked;
      }
    });
  }, [baseRules.timekeeping.addedTimeEnabled, updateTimekeepingOverride]);

  const incidentTypeOptions = useMemo(
    () => availableIncidentTypes
      .filter((incidentType) => autoCreatePointMatchIncidents || incidentType !== autoPointIncidentType)
      .map((incidentType) => {
        const definition = incidentDefinitionsByCode.get(incidentType) ?? incidentDefinitionForCode(incidentType);
        return {
          value: displayValueForIncidentDefinition(definition),
          label: displayValueForIncidentDefinition(definition),
        };
      }),
    [autoCreatePointMatchIncidents, autoPointIncidentType, availableIncidentTypes, incidentDefinitionsByCode],
  );
  const incidentCodeByDisplayValue = useMemo(() => {
    const next = new Map<string, string>();
    availableIncidentTypes.forEach((incidentType) => {
      const definition = incidentDefinitionsByCode.get(incidentType) ?? incidentDefinitionForCode(incidentType);
      next.set(normalizeIncidentLabelKey(displayValueForIncidentDefinition(definition)), definition.code);
      next.set(normalizeIncidentLabelKey(definition.code), definition.code);
    });
    return next;
  }, [availableIncidentTypes, incidentDefinitionsByCode]);

  const handleIncidentTypesChange = useCallback((values: string[]) => {
    const selections = values
      .map((rawValue) => {
        const label = String(rawValue ?? '').trim();
        const code = incidentCodeByDisplayValue.get(normalizeIncidentLabelKey(label)) ?? normalizeIncidentCode(label);
        return code ? { code, label: label || incidentTypeLabel(code) } : null;
      })
      .filter((entry): entry is { code: string; label: string } => Boolean(entry));
    const normalized = Array.from(new Set(selections.map((selection) => selection.code)));
    const nextValues = autoCreatePointMatchIncidents && autoPointIncidentType
      ? Array.from(new Set([...normalized, autoPointIncidentType]))
      : normalized;
    const labelsByCode = new Map(selections.map((selection) => [selection.code, selection.label] as const));
    const customDefinitions = nextValues
      .filter((code) => !baseIncidentDefinitionsByCode.has(code))
      .map((code) => incidentDefinitionForCode(code, {
        label: labelsByCode.get(code) ?? incidentTypeLabel(code),
        defaultEnabled: true,
      }));
    updateOverride((draft) => {
      if (nextValues.length === 0 || areSameStringSet(nextValues, baseRules.supportedIncidentTypes)) {
        delete draft.supportedIncidentTypes;
      } else {
        draft.supportedIncidentTypes = nextValues;
      }
      if (customDefinitions.length > 0) {
        draft.incidentTypeDefinitions = customDefinitions;
      } else {
        delete draft.incidentTypeDefinitions;
      }
    });
  }, [
    autoCreatePointMatchIncidents,
    autoPointIncidentType,
    baseIncidentDefinitionsByCode,
    baseRules.supportedIncidentTypes,
    incidentCodeByDisplayValue,
    updateOverride,
  ]);

  const handleAutoCreateToggle = useCallback((checked: boolean) => {
    onAutoCreatePointMatchIncidentsChange(checked);
    handleIncidentTypesChange(
      checked
        ? Array.from(new Set([...selectedIncidentTypes, autoPointIncidentType]))
        : selectedIncidentTypes.filter((incidentType) => incidentType !== autoPointIncidentType),
    );
  }, [autoPointIncidentType, handleIncidentTypesChange, onAutoCreatePointMatchIncidentsChange, selectedIncidentTypes]);

  const showTimekeeping = baseRules.timekeeping.timerMode !== 'NONE';

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-start" gap="sm" wrap="wrap">
        <div>
          <Text fw={600} size="sm">Match format and incident capture</Text>
          <Text size="sm" c="dimmed">
            The sport defines the match format. This event can adjust sport-supported result paths,
            timing, and how much incident detail officials record.
          </Text>
        </div>
        <Button
          type="button"
          size="xs"
          variant="default"
          disabled={disabled || !hasOverrides}
          onClick={() => onChange(null)}
        >
          Reset to sport defaults
        </Button>
      </Group>

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
        {baseRules.canUseOvertime ? (
          <Switch
            label="Allow overtime"
            description="Marks overtime as an available result path."
            checked={resolvedRules.supportsOvertime}
            disabled={disabled}
            onChange={(event) => setBooleanOverride(
              'supportsOvertime',
              event.currentTarget.checked,
              baseRules.supportsOvertime,
            )}
          />
        ) : null}
        {baseRules.canUseShootout ? (
          <Switch
            label="Allow shootout / tiebreak"
            description="Use when matches can finish with a final tiebreak phase."
            checked={resolvedRules.supportsShootout}
            disabled={disabled}
            onChange={(event) => setBooleanOverride(
              'supportsShootout',
              event.currentTarget.checked,
              baseRules.supportsShootout,
            )}
          />
        ) : null}
      </SimpleGrid>

      {showTimekeeping ? (
        <Stack gap="xs">
          <Text fw={600} size="sm">Match clock</Text>
          <SimpleGrid cols={{ base: 1, md: resolvedRules.timekeeping.canUseAddedTime ? 2 : 1 }} spacing="sm">
            <NumberInput
              label={timekeepingLabelForSegment(resolvedRules.segmentLabel)}
              description="Used by the match timer and schedule duration."
              min={1}
              step={1}
              value={resolvedRules.timekeeping.segmentDurationMinutes ?? ''}
              disabled={disabled}
              onChange={handleSegmentDurationChange}
            />
            {resolvedRules.timekeeping.canUseAddedTime ? (
              <Switch
                label="Allow added time"
                description="Continue showing the timer with a plus indicator after regulation time."
                checked={resolvedRules.timekeeping.addedTimeEnabled}
                disabled={disabled}
                onChange={(event) => handleAddedTimeChange(event.currentTarget.checked)}
              />
            ) : null}
          </SimpleGrid>
        </Stack>
      ) : null}

      <Stack gap="xs">
        <TagsInput
          label="Incident types available in matches"
          description="These options appear when officials add match incidents manually. Type a custom incident and press Enter to add it."
          data={incidentTypeOptions}
          value={selectedIncidentDisplayValues}
          disabled={disabled}
          clearable
          comboboxProps={comboboxProps}
          onChange={handleIncidentTypesChange}
        />
        <Group gap="xs">
          {selectedDefinitions.map((definition) => (
            <Badge
              key={definition.code}
              variant={definition.cardColor ? 'filled' : 'light'}
              color={cardBadgeColor(definition.cardColor)}
            >
              {definition.label}
            </Badge>
          ))}
        </Group>
      </Stack>

      <Switch
        label="Create a scoring incident for each point / goal"
        description="Prompt officials to identify the player before the score changes."
        checked={autoCreatePointMatchIncidents}
        disabled={incidentToggleDisabled}
        onChange={(event) => handleAutoCreateToggle(event.currentTarget.checked)}
      />

      <Text size="xs" c="dimmed">
        {autoCreatePointMatchIncidents
          ? `${incidentDefinitionsByCode.get(autoPointIncidentType)?.label ?? incidentTypeLabel(autoPointIncidentType)} incidents will stay available while automatic scoring capture is on.`
          : 'Officials can still add incidents manually when needed.'}
      </Text>

      {resolvedRules.officialRoles.length > 0 ? (
        <Text size="xs" c="dimmed">
          Suggested official roles: {resolvedRules.officialRoles.join(', ')}
        </Text>
      ) : null}
    </Stack>
  );
}
