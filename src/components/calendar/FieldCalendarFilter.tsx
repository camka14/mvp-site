'use client';

import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Group,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from '@mantine/core';

import {
  getEntityColorPair,
  getOrderedEntityColorPair,
  type EntityColorPair,
  type EntityColorReferenceValue,
} from '@/lib/entityColors';

export type FieldCalendarFilterItem = {
  id: string;
  label: string;
  detail?: string | null;
  count?: number;
  colorSeed?: string | null;
  colorMatchKey?: string | null;
  colors?: EntityColorPair;
  disabled?: boolean;
};

type FieldCalendarFilterProps = {
  items: FieldCalendarFilterItem[];
  selectedIds: string[];
  onSelectedIdsChange: (selectedIds: string[]) => void;
  disabled?: boolean;
  emptyText?: string;
  allowEmptySelection?: boolean;
  colorReferenceList?: EntityColorReferenceValue[];
};

const normalizeSearchText = (value: string): string => value.trim().toLowerCase();

export const filterFieldCalendarItems = (
  items: FieldCalendarFilterItem[],
  query: string,
): FieldCalendarFilterItem[] => {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return items;
  }

  return items.filter((item) => {
    const searchable = [
      item.label,
      item.detail ?? '',
      item.id,
    ].join(' ').toLowerCase();
    return searchable.includes(normalizedQuery);
  });
};

export default function FieldCalendarFilter({
  items,
  selectedIds,
  onSelectedIdsChange,
  disabled = false,
  emptyText = 'No fields match your search.',
  allowEmptySelection = false,
  colorReferenceList,
}: FieldCalendarFilterProps) {
  const [query, setQuery] = useState('');
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const filteredItems = useMemo(() => filterFieldCalendarItems(items, query), [items, query]);
  const enabledItems = useMemo(() => items.filter((item) => !item.disabled), [items]);
  const allEnabledIds = useMemo(() => enabledItems.map((item) => item.id), [enabledItems]);
  const selectedCount = selectedIds.filter((id) => items.some((item) => item.id === id)).length;

  const handleToggle = (item: FieldCalendarFilterItem) => {
    if (disabled || item.disabled) return;

    const isSelected = selectedSet.has(item.id);
    if (isSelected) {
      const nextIds = selectedIds.filter((id) => id !== item.id);
      if (!allowEmptySelection && nextIds.length === 0) {
        return;
      }
      onSelectedIdsChange(nextIds);
      return;
    }

    onSelectedIdsChange([...selectedIds, item.id]);
  };

  return (
    <aside className="field-calendar-filter" aria-label="Fields">
      <Stack gap="sm">
        <Group justify="space-between" align="center" gap="sm">
          <div>
            <Text fw={700} size="sm">Fields</Text>
            <Text c="dimmed" size="xs">
              {selectedCount} of {items.length} selected
            </Text>
          </div>
          <Button
            size="compact-xs"
            variant="light"
            disabled={disabled || allEnabledIds.length === 0}
            onClick={() => onSelectedIdsChange(allEnabledIds)}
          >
            All
          </Button>
        </Group>
        <TextInput
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder="Search fields"
          aria-label="Search fields"
          disabled={disabled}
          size="sm"
        />
        <ScrollArea.Autosize mah={520} type="auto">
          <Stack gap={6}>
            {filteredItems.length > 0 ? filteredItems.map((item) => {
              const colorMatchKey = item.colorMatchKey ?? item.colorSeed ?? item.label ?? item.id;
              const colors = item.colors ?? (
                colorReferenceList
                  ? getOrderedEntityColorPair(colorReferenceList, colorMatchKey)
                  : getEntityColorPair(colorMatchKey)
              );
              const isSelected = selectedSet.has(item.id);
              const cannotDeselect = isSelected && !allowEmptySelection && selectedIds.length === 1;
              return (
                <UnstyledButton
                  key={item.id}
                  className={[
                    'field-calendar-filter__row',
                    isSelected ? 'field-calendar-filter__row--selected' : '',
                    item.disabled ? 'field-calendar-filter__row--disabled' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => handleToggle(item)}
                  disabled={disabled || item.disabled || cannotDeselect}
                  aria-pressed={isSelected}
                >
                  <span
                    className="field-calendar-filter__swatch"
                    style={{ backgroundColor: colors.bg, color: colors.text, borderColor: colors.text }}
                    aria-hidden="true"
                  />
                  <span className="field-calendar-filter__content">
                    <span className="field-calendar-filter__label">{item.label}</span>
                    {item.detail ? (
                      <span className="field-calendar-filter__detail">{item.detail}</span>
                    ) : null}
                  </span>
                  {typeof item.count === 'number' ? (
                    <Badge variant="light" size="sm">
                      {item.count}
                    </Badge>
                  ) : null}
                  <span className="field-calendar-filter__check" aria-hidden="true">
                    ✓
                  </span>
                </UnstyledButton>
              );
            }) : (
              <Text c="dimmed" size="sm" px="xs" py="sm">
                {emptyText}
              </Text>
            )}
          </Stack>
        </ScrollArea.Autosize>
      </Stack>
    </aside>
  );
}
