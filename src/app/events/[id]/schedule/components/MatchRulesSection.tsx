import React, { useCallback, useMemo } from 'react';
import { Button, Group, MultiSelect, NumberInput, SimpleGrid, Stack, Switch, Text } from '@mantine/core';

import type { EventOfficialPosition, MatchRulesConfig, ResolvedMatchRules, Sport } from '@/types';

const DEFAULT_POINT_INCIDENT_TYPE = 'POINT';
const DEFAULT_INCIDENT_TYPES = [DEFAULT_POINT_INCIDENT_TYPE, 'DISCIPLINE', 'NOTE', 'ADMIN'] as const;

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

const normalizeRulesConfig = (value: MatchRulesConfig | null | undefined): MatchRulesConfig => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const normalized: MatchRulesConfig = {};
  const segmentCount = normalizePositiveInt(value.segmentCount);
  if (segmentCount) {
    normalized.segmentCount = segmentCount;
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
  const supportedIncidentTypes = normalizeStringList(value.supportedIncidentTypes);
  if (supportedIncidentTypes.length > 0) {
    normalized.supportedIncidentTypes = supportedIncidentTypes;
  }
  if (typeof value.pointIncidentRequiresParticipant === 'boolean') {
    normalized.pointIncidentRequiresParticipant = value.pointIncidentRequiresParticipant;
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

const scoringModelLabel = (model: ResolvedMatchRules['scoringModel']): string => {
  switch (model) {
    case 'SETS':
      return 'Sets';
    case 'INNINGS':
      return 'Innings';
    case 'POINTS_ONLY':
      return 'Points only';
    case 'PERIODS':
    default:
      return 'Periods';
  }
};

const incidentTypeLabel = (value: string): string => {
  switch (value) {
    case 'POINT':
      return 'Point / Goal';
    case 'DISCIPLINE':
      return 'Discipline';
    case 'NOTE':
      return 'Note';
    case 'ADMIN':
      return 'Admin';
    default:
      return value
        .trim()
        .toLowerCase()
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (character) => character.toUpperCase());
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

const resolveMatchRules = (params: {
  sportTemplate?: MatchRulesConfig | null;
  eventOverride?: MatchRulesConfig | null;
  usesSets?: boolean | null;
  setsPerMatch?: number | null;
  winnerSetCount?: number | null;
  officialPositions?: EventOfficialPosition[] | null;
}): ResolvedMatchRules => {
  const sportTemplate = normalizeRulesConfig(params.sportTemplate);
  const eventOverride = normalizeRulesConfig(params.eventOverride);
  const merged: MatchRulesConfig = { ...sportTemplate, ...eventOverride };
  const fallbackModel: ResolvedMatchRules['scoringModel'] = params.usesSets ? 'SETS' : 'POINTS_ONLY';
  const scoringModel = resolveScoringModel(merged.scoringModel, fallbackModel);
  const fallbackSegmentCount = scoringModel === 'SETS'
    ? normalizePositiveInt(params.setsPerMatch ?? params.winnerSetCount) ?? 1
    : 1;
  const officialRolesFromPositions = (params.officialPositions ?? [])
    .map((position) => position.name.trim())
    .filter(Boolean);
  const supportedIncidentTypes = normalizeStringList(merged.supportedIncidentTypes);
  const officialRoles = normalizeStringList(merged.officialRoles);
  const autoCreatePointIncidentType = typeof merged.autoCreatePointIncidentType === 'string' && merged.autoCreatePointIncidentType.trim()
    ? merged.autoCreatePointIncidentType.trim()
    : DEFAULT_POINT_INCIDENT_TYPE;

  return {
    scoringModel,
    segmentCount: normalizePositiveInt(merged.segmentCount) ?? fallbackSegmentCount,
    segmentLabel: typeof merged.segmentLabel === 'string' && merged.segmentLabel.trim()
      ? merged.segmentLabel.trim()
      : segmentLabelForModel(scoringModel),
    supportsDraw: merged.supportsDraw === true,
    supportsOvertime: merged.supportsOvertime === true,
    supportsShootout: merged.supportsShootout === true,
    officialRoles: officialRoles.length > 0 ? officialRoles : officialRolesFromPositions,
    supportedIncidentTypes: supportedIncidentTypes.length > 0 ? supportedIncidentTypes : [...DEFAULT_INCIDENT_TYPES],
    autoCreatePointIncidentType,
    pointIncidentRequiresParticipant: merged.pointIncidentRequiresParticipant === true,
  };
};

const RuleSummary = ({
  label,
  value,
  help,
}: {
  label: string;
  value: string;
  help: string;
}) => (
  <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
    <Text size="xs" c="dimmed">{label}</Text>
    <Text fw={600} size="sm">{value}</Text>
    <Text size="xs" c="dimmed" mt={2}>{help}</Text>
  </div>
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
      usesSets,
      setsPerMatch,
      winnerSetCount,
      officialPositions,
    }),
    [officialPositions, setsPerMatch, sport?.matchRulesTemplate, usesSets, winnerSetCount],
  );
  const resolvedRules = useMemo(
    () => resolveMatchRules({
      sportTemplate: sport?.matchRulesTemplate ?? null,
      eventOverride: value ?? null,
      usesSets,
      setsPerMatch,
      winnerSetCount,
      officialPositions,
    }),
    [officialPositions, setsPerMatch, sport?.matchRulesTemplate, usesSets, value, winnerSetCount],
  );
  const normalizedOverride = useMemo(() => normalizeRulesConfig(value), [value]);
  const hasOverrides = Object.keys(normalizedOverride).length > 0;
  const availableIncidentTypes = useMemo(() => (
    Array.from(
      new Set([
        ...DEFAULT_INCIDENT_TYPES,
        ...baseRules.supportedIncidentTypes,
        ...resolvedRules.supportedIncidentTypes,
      ]),
    )
  ), [baseRules.supportedIncidentTypes, resolvedRules.supportedIncidentTypes]);
  const selectedIncidentTypes = resolvedRules.supportedIncidentTypes;
  const autoPointIncidentType = resolvedRules.autoCreatePointIncidentType?.trim() || DEFAULT_POINT_INCIDENT_TYPE;

  const updateOverride = useCallback((updater: (draft: MatchRulesConfig) => void) => {
    const draft = normalizeRulesConfig(normalizedOverride);
    updater(draft);
    const next = normalizeRulesConfig(draft);
    onChange(Object.keys(next).length > 0 ? next : null);
  }, [normalizedOverride, onChange]);

  const setBooleanOverride = useCallback((
    key: 'supportsDraw' | 'supportsOvertime' | 'supportsShootout' | 'pointIncidentRequiresParticipant',
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

  const handleSegmentCountChange = useCallback((value: string | number) => {
    const normalized = typeof value === 'number'
      ? normalizePositiveInt(value)
      : normalizePositiveInt(value.trim());
    updateOverride((draft) => {
      if (!normalized || normalized === baseRules.segmentCount) {
        delete draft.segmentCount;
      } else {
        draft.segmentCount = normalized;
      }
    });
  }, [baseRules.segmentCount, updateOverride]);

  const handleIncidentTypesChange = useCallback((values: string[]) => {
    const normalized = normalizeStringList(values);
    const nextValues = autoCreatePointMatchIncidents && autoPointIncidentType
      ? Array.from(new Set([...normalized, autoPointIncidentType]))
      : normalized;
    updateOverride((draft) => {
      if (nextValues.length === 0 || areSameStringSet(nextValues, baseRules.supportedIncidentTypes)) {
        delete draft.supportedIncidentTypes;
      } else {
        draft.supportedIncidentTypes = nextValues;
      }
    });
  }, [autoCreatePointMatchIncidents, autoPointIncidentType, baseRules.supportedIncidentTypes, updateOverride]);

  const handleAutoCreateToggle = useCallback((checked: boolean) => {
    onAutoCreatePointMatchIncidentsChange(checked);
    if (!checked) {
      return;
    }
    handleIncidentTypesChange(selectedIncidentTypes);
  }, [handleIncidentTypesChange, onAutoCreatePointMatchIncidentsChange, selectedIncidentTypes]);

  const incidentTypeOptions = useMemo(
    () => availableIncidentTypes.map((incidentType) => ({
      value: incidentType,
      label: incidentTypeLabel(incidentType),
    })),
    [availableIncidentTypes],
  );

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-start" gap="sm" wrap="wrap">
        <div>
          <Text fw={600} size="sm">Match format and incident capture</Text>
          <Text size="sm" c="dimmed">
            The sport defines the format. This event can adjust how many segments are played,
            which result outcomes are allowed, and how much incident detail officials record.
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

      <SimpleGrid cols={{ base: 1, md: 3 }} spacing="sm">
        <RuleSummary
          label="Scoring model"
          value={scoringModelLabel(resolvedRules.scoringModel)}
          help="Locked to the sport template."
        />
        <RuleSummary
          label="Segment label"
          value={resolvedRules.segmentLabel}
          help="Used for match scores and incident prompts."
        />
        <RuleSummary
          label="Point incident type"
          value={incidentTypeLabel(autoPointIncidentType)}
          help="Created when automatic point incidents are enabled."
        />
      </SimpleGrid>

      <NumberInput
        label={`${resolvedRules.segmentLabel} count`}
        description={`Leave blank to use the sport default of ${baseRules.segmentCount}.`}
        value={normalizedOverride.segmentCount ?? ''}
        min={1}
        max={20}
        clampBehavior="strict"
        disabled={disabled}
        onChange={handleSegmentCountChange}
      />

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
        <Switch
          label="Allow draws"
          description="Useful for league play and group-stage matches."
          checked={resolvedRules.supportsDraw}
          disabled={disabled}
          onChange={(event) => setBooleanOverride(
            'supportsDraw',
            event.currentTarget.checked,
            baseRules.supportsDraw,
          )}
        />
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
        <Switch
          label="Point incidents require a participant"
          description="Require officials to identify the player when logging a scoring incident."
          checked={resolvedRules.pointIncidentRequiresParticipant}
          disabled={disabled}
          onChange={(event) => setBooleanOverride(
            'pointIncidentRequiresParticipant',
            event.currentTarget.checked,
            baseRules.pointIncidentRequiresParticipant,
          )}
        />
      </SimpleGrid>

      <MultiSelect
        label="Incident types available in matches"
        description="These options appear when officials add match incidents manually."
        data={incidentTypeOptions}
        value={selectedIncidentTypes}
        disabled={disabled}
        searchable
        clearable
        comboboxProps={comboboxProps}
        onChange={handleIncidentTypesChange}
      />

      <Switch
        label="Create a scoring incident for each point / goal"
        description="Prompt officials for scoring details before the score changes."
        checked={autoCreatePointMatchIncidents}
        disabled={incidentToggleDisabled}
        onChange={(event) => handleAutoCreateToggle(event.currentTarget.checked)}
      />

      <Text size="xs" c="dimmed">
        {autoCreatePointMatchIncidents
          ? `${incidentTypeLabel(autoPointIncidentType)} incidents will stay available while automatic scoring capture is on.`
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
