'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Group, Pill, PillsInput, Popover, ScrollArea, Text } from '@mantine/core';
import type { EventTag } from '@/types';

type EventTagsInputProps = {
  value: EventTag[];
  disabled?: boolean;
  error?: string;
  onChange: (value: EventTag[]) => void;
};

const normalizeTagName = (value: string): string => value.replace(/\s+/g, ' ').trim().slice(0, 40);
const slugifyTagName = (value: string): string => (
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
);

const tagIdentity = (tag: EventTag): string => tag.slug || slugifyTagName(tag.name);

export function EventTagsInput({ value, disabled = false, error, onChange }: EventTagsInputProps) {
  const [search, setSearch] = useState('');
  const [options, setOptions] = useState<EventTag[]>([]);
  const [opened, setOpened] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const normalizedSearch = normalizeTagName(search);
  const selectedIdentities = useMemo(
    () => new Set(value.map(tagIdentity)),
    [value],
  );
  const visibleOptions = useMemo(() => (
    options.filter((option) => !selectedIdentities.has(tagIdentity(option)))
  ), [options, selectedIdentities]);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      const params = new URLSearchParams();
      if (normalizedSearch) {
        params.set('query', normalizedSearch);
      }
      fetch(`/api/event-tags?${params.toString()}`, { signal: controller.signal })
        .then((response) => response.ok ? response.json() : Promise.reject(new Error('Failed to load tags')))
        .then((body) => {
          const tags = Array.isArray(body?.tags) ? body.tags : [];
          setOptions(tags);
        })
        .catch((fetchError) => {
          if (fetchError.name !== 'AbortError') {
            setOptions([]);
          }
        });
    }, 180);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [normalizedSearch]);

  const addTag = (tag: EventTag) => {
    const name = normalizeTagName(tag.name);
    if (!name) {
      return;
    }
    const identity = tag.slug || slugifyTagName(name);
    if (selectedIdentities.has(identity)) {
      setSearch('');
      return;
    }
    onChange([...value, { ...tag, name, slug: identity }]);
    setSearch('');
    setOpened(false);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  };

  const addTypedTag = () => {
    if (!normalizedSearch) {
      return;
    }
    const typedIdentity = slugifyTagName(normalizedSearch);
    const exactMatch = options.find((option) => tagIdentity(option) === typedIdentity);
    addTag(exactMatch ?? { name: normalizedSearch, slug: typedIdentity });
  };

  const removeTag = (identity: string) => {
    onChange(value.filter((tag) => tagIdentity(tag) !== identity));
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
          label="Tags"
          error={error}
          disabled={disabled}
          onClick={() => {
            if (!disabled) {
              setOpened(true);
              inputRef.current?.focus();
            }
          }}
        >
          <Pill.Group>
            {value.map((tag) => {
              const identity = tagIdentity(tag);
              return (
                <Pill
                  key={identity}
                  withRemoveButton={!disabled}
                  onRemove={() => removeTag(identity)}
                >
                  {tag.name}
                </Pill>
              );
            })}
            <PillsInput.Field
              ref={inputRef}
              value={search}
              disabled={disabled}
              placeholder={value.length ? 'Add tag' : 'Enter tag'}
              onFocus={() => setOpened(true)}
              onChange={(event) => {
                setSearch(event.currentTarget.value);
                setOpened(true);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addTypedTag();
                }
                if (event.key === 'Backspace' && !search && value.length > 0) {
                  event.preventDefault();
                  removeTag(tagIdentity(value[value.length - 1]));
                }
              }}
            />
          </Pill.Group>
        </PillsInput>
      </Popover.Target>
      <Popover.Dropdown p="xs">
        <ScrollArea.Autosize mah={220} type="auto">
          <Group gap="xs" align="center">
            {normalizedSearch && !options.some((option) => tagIdentity(option) === slugifyTagName(normalizedSearch)) ? (
              <Button
                type="button"
                variant="light"
                radius="xl"
                size="compact-sm"
                disabled={selectedIdentities.has(slugifyTagName(normalizedSearch))}
                onClick={() => addTypedTag()}
              >
                {normalizedSearch}
              </Button>
            ) : null}
            {visibleOptions.map((option) => (
              <Button
                key={tagIdentity(option)}
                type="button"
                variant="light"
                radius="xl"
                size="compact-sm"
                onClick={() => addTag(option)}
              >
                {option.name}
              </Button>
            ))}
            {!normalizedSearch && visibleOptions.length === 0 ? (
              <Text size="sm" c="dimmed">
                Start typing to add tags.
              </Text>
            ) : null}
          </Group>
        </ScrollArea.Autosize>
      </Popover.Dropdown>
    </Popover>
  );
}
