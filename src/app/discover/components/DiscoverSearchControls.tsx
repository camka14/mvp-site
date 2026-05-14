'use client';

import { Button, Group, TextInput } from '@mantine/core';
import { MapPinned, Search } from 'lucide-react';
import LocationSearch from '@/components/location/LocationSearch';

type DiscoverSearchControlsProps = {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  onSearch: () => void;
  onOpenMap?: () => void;
  searchLabel?: string;
};

export default function DiscoverSearchControls({
  value,
  onValueChange,
  placeholder = 'Search discover...',
  onSearch,
  onOpenMap,
  searchLabel = 'Search',
}: DiscoverSearchControlsProps) {
  return (
    <Group align="center" gap="sm" wrap="wrap" style={{ flex: 1, minWidth: 320 }}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSearch();
        }}
        style={{ display: 'flex', flex: '1 1 420px', minWidth: 300 }}
      >
        <TextInput
          aria-label={searchLabel}
          value={value}
          onChange={(event) => onValueChange(event.currentTarget.value)}
          placeholder={placeholder}
          style={{ flex: 1, minWidth: 160 }}
          styles={{
            input: {
              borderTopRightRadius: 0,
              borderBottomRightRadius: 0,
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
