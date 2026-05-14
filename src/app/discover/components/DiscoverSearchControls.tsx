'use client';

import { Button, Group, Select, TextInput } from '@mantine/core';
import { MapPinned, Search } from 'lucide-react';
import LocationSearch from '@/components/location/LocationSearch';

export type DiscoverSearchTarget = 'events' | 'organizations' | 'rentals' | 'teams';

const SEARCH_TARGET_OPTIONS: Array<{ value: DiscoverSearchTarget; label: string }> = [
  { value: 'events', label: 'Events' },
  { value: 'organizations', label: 'Organizations' },
  { value: 'rentals', label: 'Rentals' },
  { value: 'teams', label: 'Teams' },
];

type DiscoverSearchControlsProps = {
  target: DiscoverSearchTarget;
  onTargetChange: (target: DiscoverSearchTarget) => void;
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  onSearch: () => void;
  onOpenMap?: () => void;
  includeTeams?: boolean;
  searchLabel?: string;
  showTargetSelect?: boolean;
};

export default function DiscoverSearchControls({
  target,
  onTargetChange,
  value,
  onValueChange,
  placeholder = 'Search discover...',
  onSearch,
  onOpenMap,
  includeTeams = true,
  searchLabel = 'Search',
  showTargetSelect = true,
}: DiscoverSearchControlsProps) {
  const targets = includeTeams
    ? SEARCH_TARGET_OPTIONS
    : SEARCH_TARGET_OPTIONS.filter((option) => option.value !== 'teams');

  return (
    <Group align="center" gap="sm" wrap="wrap" style={{ flex: 1, minWidth: 320 }}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSearch();
        }}
        style={{ display: 'flex', flex: '1 1 420px', minWidth: 300 }}
      >
        {showTargetSelect && (
          <Select
            aria-label="Search category"
            data={targets}
            value={target}
            onChange={(nextTarget) => {
              if (nextTarget) {
                onTargetChange(nextTarget as DiscoverSearchTarget);
              }
            }}
            allowDeselect={false}
            comboboxProps={{ withinPortal: true }}
            styles={{
              input: {
                borderTopRightRadius: 0,
                borderBottomRightRadius: 0,
              },
            }}
            style={{ width: 158, flexShrink: 0 }}
          />
        )}
        <TextInput
          aria-label={searchLabel}
          value={value}
          onChange={(event) => onValueChange(event.currentTarget.value)}
          placeholder={placeholder}
          style={{ flex: 1, minWidth: 160 }}
          styles={{
            input: {
              borderTopLeftRadius: showTargetSelect ? 0 : undefined,
              borderBottomLeftRadius: showTargetSelect ? 0 : undefined,
              borderTopRightRadius: 0,
              borderBottomRightRadius: 0,
              borderLeft: showTargetSelect ? 0 : undefined,
              borderRight: 0,
            },
          }}
        />
        <Button
          type="submit"
          leftSection={<Search size={16} />}
          style={{
            borderTopLeftRadius: 0,
            borderBottomLeftRadius: 0,
            flexShrink: 0,
          }}
        >
          Search
        </Button>
      </form>
      <Group gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>
        <LocationSearch />
        {onOpenMap && (
          <Button variant="default" onClick={onOpenMap} leftSection={<MapPinned size={16} />}>
            Map
          </Button>
        )}
      </Group>
    </Group>
  );
}
