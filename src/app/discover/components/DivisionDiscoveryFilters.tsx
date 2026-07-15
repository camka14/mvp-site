import { useEffect, useMemo, useState } from 'react';
import { Alert, Group, Loader, MultiSelect, NumberInput, Stack, Text } from '@mantine/core';

type DivisionOption = { id: string; name: string };
type DivisionTypePayload = {
  genders?: DivisionOption[];
  ages?: DivisionOption[];
  sportSkills?: SportSkillGroup[];
};

export type SportSkillGroup = {
  sportId: string;
  sportName?: string;
  skills: DivisionOption[];
};

export type DivisionDiscoveryFilterValue = {
  genders: string[];
  skillDivisionTypeIds: string[];
  ageDivisionTypeIds: string[];
  priceMinDollars: number | null;
  priceMaxDollars: number | null;
};

type Props = {
  value: DivisionDiscoveryFilterValue;
  onChange: (value: DivisionDiscoveryFilterValue) => void;
  selectedSports?: string[];
};

const normalize = (value: string): string => value.trim().toLowerCase();

export const buildSportSkillFilterOptions = (
  groups: SportSkillGroup[],
  selectedSports: string[],
): Array<{ value: string; label: string }> => {
  const selectedSportKeys = new Set(selectedSports.map(normalize).filter(Boolean));
  const eligibleGroups = groups
    .filter((group) => (
      selectedSportKeys.size === 0
      || selectedSportKeys.has(normalize(group.sportId))
      || selectedSportKeys.has(normalize(group.sportName ?? ''))
    ))
    .map((group) => ({
      ...group,
      displayName: group.sportName?.trim() || group.sportId.trim(),
    }))
    .sort((left, right) => left.displayName.localeCompare(right.displayName));

  const bySkillId = new Map<string, { name: string; sports: string[] }>();
  eligibleGroups.forEach((group) => {
    group.skills.forEach((skill) => {
      const id = skill.id.trim().toLowerCase();
      if (!id) return;
      const current = bySkillId.get(id) ?? { name: skill.name.trim() || skill.id, sports: [] };
      if (group.displayName && !current.sports.includes(group.displayName)) {
        current.sports.push(group.displayName);
      }
      bySkillId.set(id, current);
    });
  });

  const labelSports = eligibleGroups.length > 1;
  return Array.from(bySkillId, ([value, option]) => ({
    value,
    name: option.name,
    firstSport: option.sports[0] ?? '',
    label: labelSports && option.sports.length > 0
      ? `${option.sports.join(', ')} · ${option.name}`
      : option.name,
  }))
    .sort((left, right) => (
      left.firstSport.localeCompare(right.firstSport)
      || left.name.localeCompare(right.name)
    ))
    .map(({ value, label }) => ({ value, label }));
};

export default function DivisionDiscoveryFilters({ value, onChange, selectedSports = [] }: Props) {
  const [types, setTypes] = useState<DivisionTypePayload>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch('/api/division-types', { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Failed to load division filters')))
      .then((body) => setTypes(body ?? {}))
      .catch((loadError) => {
        if (loadError.name !== 'AbortError') setError('Unable to load division filters.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const skillOptions = useMemo(
    () => buildSportSkillFilterOptions(types.sportSkills ?? [], selectedSports),
    [selectedSports, types.sportSkills],
  );

  useEffect(() => {
    if (loading) return;
    const availableSkillIds = new Set(skillOptions.map((option) => option.value));
    const nextSkillIds = value.skillDivisionTypeIds.filter((id) => availableSkillIds.has(normalize(id)));
    if (
      nextSkillIds.length !== value.skillDivisionTypeIds.length
      || nextSkillIds.some((id, index) => id !== value.skillDivisionTypeIds[index])
    ) {
      onChange({ ...value, skillDivisionTypeIds: nextSkillIds });
    }
  }, [loading, onChange, skillOptions, value]);

  if (loading) return <Loader size="sm" aria-label="Loading division filters" />;
  if (error) return <Alert color="red">{error}</Alert>;

  return (
    <Stack gap="sm">
      <Text size="xs" fw={700} c="dimmed" tt="uppercase">Division</Text>
      <MultiSelect
        label="Gender"
        placeholder="Any gender"
        data={(types.genders ?? []).map((option) => ({ value: option.id, label: option.name }))}
        value={value.genders}
        clearable
        onChange={(genders) => onChange({ ...value, genders })}
      />
      <MultiSelect
        label="Age group"
        placeholder="Any age group"
        data={(types.ages ?? []).map((option) => ({ value: option.id, label: option.name }))}
        value={value.ageDivisionTypeIds}
        searchable
        clearable
        onChange={(ageDivisionTypeIds) => onChange({ ...value, ageDivisionTypeIds })}
      />
      <MultiSelect
        label="Skill level"
        placeholder="Any skill level"
        data={skillOptions}
        value={value.skillDivisionTypeIds}
        searchable
        clearable
        onChange={(skillDivisionTypeIds) => onChange({ ...value, skillDivisionTypeIds })}
      />
      <Group grow align="flex-start">
        <NumberInput
          label="Minimum price"
          prefix="$"
          min={0}
          decimalScale={2}
          value={value.priceMinDollars ?? ''}
          onChange={(next) => onChange({
            ...value,
            priceMinDollars: typeof next === 'number' && Number.isFinite(next) ? next : null,
          })}
        />
        <NumberInput
          label="Maximum price"
          prefix="$"
          min={0}
          decimalScale={2}
          value={value.priceMaxDollars ?? ''}
          onChange={(next) => onChange({
            ...value,
            priceMaxDollars: typeof next === 'number' && Number.isFinite(next) ? next : null,
          })}
        />
      </Group>
      <Text size="xs" c="dimmed">
        All selected division filters must match the same division.
      </Text>
    </Stack>
  );
}
