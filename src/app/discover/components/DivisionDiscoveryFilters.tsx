import { useEffect, useMemo, useState } from 'react';
import { Alert, Group, Loader, MultiSelect, NumberInput, Stack, Text } from '@mantine/core';

type DivisionOption = { id: string; name: string };
type DivisionTypePayload = {
  genders?: DivisionOption[];
  ages?: DivisionOption[];
  sportSkills?: Array<{ sportId: string; skills: DivisionOption[] }>;
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
};

export default function DivisionDiscoveryFilters({ value, onChange }: Props) {
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

  const skillOptions = useMemo(() => {
    const byId = new Map<string, string>();
    (types.sportSkills ?? []).forEach((group) => {
      group.skills.forEach((skill) => byId.set(skill.id, skill.name));
    });
    return Array.from(byId, ([id, name]) => ({ value: id, label: name }))
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [types.sportSkills]);

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
