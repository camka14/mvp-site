'use client';

import React, { useMemo, useState } from 'react';
import { Button, Group, Pill, PillsInput, Popover, ScrollArea, Text } from '@mantine/core';

export type ResourceSportOption = {
  value: string;
  label: string;
};

const normalizeSportSearch = (value: string): string => value.replace(/\s+/g, ' ').trim();

type ResourceSportsInputProps = {
  value: string[];
  options: ResourceSportOption[];
  loading: boolean;
  disabled?: boolean;
  onChange: (value: string[]) => void;
};

export default function ResourceSportsInput({
  value,
  options,
  loading,
  disabled = false,
  onChange,
}: ResourceSportsInputProps) {
  const [search, setSearch] = useState('');
  const [opened, setOpened] = useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const normalizedSearch = normalizeSportSearch(search);
  const selectedValues = useMemo(() => new Set(value), [value]);
  const optionByValue = useMemo(
    () => new Map(options.map((option) => [option.value, option])),
    [options],
  );
  const selectedOptions = useMemo(() => (
    value.map((sportId) => optionByValue.get(sportId) ?? { value: sportId, label: sportId })
  ), [optionByValue, value]);
  const visibleOptions = useMemo(() => (
    options
      .filter((option) => !selectedValues.has(option.value))
      .filter((option) => (
        !normalizedSearch
        || option.label.toLowerCase().includes(normalizedSearch.toLowerCase())
        || option.value.toLowerCase().includes(normalizedSearch.toLowerCase())
      ))
      .sort((left, right) => left.label.localeCompare(right.label))
      .slice(0, 8)
  ), [normalizedSearch, options, selectedValues]);

  const addSport = (sportId: string) => {
    if (!sportId || selectedValues.has(sportId)) {
      setSearch('');
      return;
    }
    onChange([...value, sportId]);
    setSearch('');
    setOpened(true);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  };

  const removeSport = (sportId: string) => {
    onChange(value.filter((selectedSportId) => selectedSportId !== sportId));
  };

  const addFirstVisibleSport = () => {
    const [firstOption] = visibleOptions;
    if (firstOption) {
      addSport(firstOption.value);
    }
  };

  return (
    <Popover
      opened={opened && !disabled}
      onChange={setOpened}
      width="target"
      position="bottom-start"
      shadow="md"
      withinPortal
    >
      <Popover.Target>
        <PillsInput
          label="Sports"
          disabled={disabled}
          onClick={() => {
            if (!disabled) {
              setOpened(true);
              inputRef.current?.focus();
            }
          }}
        >
          <Pill.Group>
            {selectedOptions.map((option) => (
              <Pill
                key={option.value}
                withRemoveButton={!disabled}
                onRemove={() => removeSport(option.value)}
              >
                {option.label}
              </Pill>
            ))}
            <PillsInput.Field
              ref={inputRef}
              value={search}
              disabled={disabled}
              placeholder={value.length ? 'Add sport' : loading ? 'Loading sports...' : 'Select sports'}
              onFocus={() => setOpened(true)}
              onChange={(event) => {
                setSearch(event.currentTarget.value);
                setOpened(true);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addFirstVisibleSport();
                }
                if (event.key === 'Backspace' && !search && value.length > 0) {
                  event.preventDefault();
                  removeSport(value[value.length - 1]);
                }
              }}
            />
          </Pill.Group>
        </PillsInput>
      </Popover.Target>
      <Popover.Dropdown p="xs">
        <ScrollArea.Autosize mah={220} type="auto">
          <Group gap="xs" align="center">
            {visibleOptions.map((option) => (
              <Button
                key={option.value}
                type="button"
                variant="light"
                radius="xl"
                size="compact-sm"
                onClick={() => addSport(option.value)}
              >
                {option.label}
              </Button>
            ))}
            {!loading && visibleOptions.length === 0 ? (
              <Text size="sm" c="dimmed">
                {normalizedSearch ? 'No sports match this search.' : 'No sports available.'}
              </Text>
            ) : null}
            {loading ? (
              <Text size="sm" c="dimmed">
                Loading sports...
              </Text>
            ) : null}
          </Group>
        </ScrollArea.Autosize>
      </Popover.Dropdown>
    </Popover>
  );
}
