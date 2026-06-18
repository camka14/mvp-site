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
  title?: string;
  ariaLabel?: string;
  searchPlaceholder?: string;
  searchAriaLabel?: string;
  emptyText?: string;
  allowEmptySelection?: boolean;
  colorReferenceList?: EntityColorReferenceValue[];
  showHeader?: boolean;
  inlineControls?: boolean;
  unframed?: boolean;
  maxVisibleItems?: number;
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
  title = 'Fields',
  ariaLabel,
  searchPlaceholder = 'Search fields',
  searchAriaLabel,
  emptyText = 'No fields match your search.',
  allowEmptySelection = false,
  colorReferenceList,
  showHeader = true,
  inlineControls = false,
  unframed = false,
  maxVisibleItems,
}: FieldCalendarFilterProps) {
  const [query, setQuery] = useState('');
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const filteredItems = useMemo(() => filterFieldCalendarItems(items, query), [items, query]);
  const enabledItems = useMemo(() => items.filter((item) => !item.disabled), [items]);
  const allEnabledIds = useMemo(() => enabledItems.map((item) => item.id), [enabledItems]);
  const selectedCount = selectedIds.filter((id) => items.some((item) => item.id === id)).length;
  const listMaxHeight = typeof maxVisibleItems === 'number' && maxVisibleItems > 0
    ? (maxVisibleItems * 34) + (Math.max(0, maxVisibleItems - 1) * 6)
    : 520;

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

  const allButton = (
    <Button
      size="compact-xs"
      variant="light"
      disabled={disabled || allEnabledIds.length === 0}
      onClick={() => onSelectedIdsChange(allEnabledIds)}
    >
      All
    </Button>
  );

  const searchInput = (
    <TextInput
      value={query}
      onChange={(event) => setQuery(event.currentTarget.value)}
      placeholder={searchPlaceholder}
      aria-label={searchAriaLabel ?? searchPlaceholder}
      disabled={disabled}
      size="sm"
      style={inlineControls ? { flex: 1, minWidth: 0 } : undefined}
    />
  );

  return (
    <aside
      className={['field-calendar-filter', unframed ? 'field-calendar-filter--unframed' : ''].filter(Boolean).join(' ')}
      aria-label={ariaLabel ?? title}
    >
      <Stack gap="sm">
        {showHeader ? (
          <Group justify="space-between" align="center" gap="sm">
            <div>
              <Text fw={700} size="sm">{title}</Text>
              <Text c="dimmed" size="xs">
                {selectedCount} of {items.length} selected
              </Text>
            </div>
            {!inlineControls ? allButton : null}
          </Group>
        ) : null}
        {inlineControls ? (
          <Group gap="xs" align="center" wrap="nowrap">
            {searchInput}
            {allButton}
          </Group>
        ) : (
          <>
            {!showHeader ? allButton : null}
            {searchInput}
          </>
        )}
        <ScrollArea.Autosize mah={listMaxHeight} type="auto">
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
