'use client';

import { useMemo, useRef, useState } from 'react';
import { Button, Group, Pill, PillsInput, Popover, ScrollArea, Text } from '@mantine/core';
import type { EventTag } from '@/types';
import { getEventTagIdentity, isEventTypeTag, slugifyEventTagName } from './eventTypeTags';

type EventTagsInputProps = {
  value: EventTag[];
  options: EventTag[];
  disabled?: boolean;
  error?: string;
  lockedTagSlugs?: string[];
  onChange: (value: EventTag[]) => void;
};

const normalizeTagName = (value: string): string => value.replace(/\s+/g, ' ').trim().slice(0, 40);
const tagIdentity = (tag: EventTag): string => getEventTagIdentity(tag);
const tagLabel = (tag: EventTag): string => `${tag.name} (${tag.eventCount ?? 0})`;
const isSystemTag = (tag: EventTag): boolean => tag.isSystem === true || isEventTypeTag(tag);
const tagColor = (tag: EventTag): 'blue' | 'green' => isSystemTag(tag) ? 'blue' : 'green';
const tagPillStyles = (tag: EventTag) => {
  const color = tagColor(tag);
  return {
    root: {
      backgroundColor: `var(--mantine-color-${color}-0)`,
      color: `var(--mantine-color-${color}-8)`,
    },
    remove: {
      color: `var(--mantine-color-${color}-7)`,
    },
  };
};

export function EventTagsInput({ value, options, disabled = false, error, lockedTagSlugs = [], onChange }: EventTagsInputProps) {
  const [search, setSearch] = useState('');
  const [opened, setOpened] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const normalizedSearch = normalizeTagName(search);
  const selectedIdentities = useMemo(
    () => new Set(value.map(tagIdentity)),
    [value],
  );
  const lockedIdentities = useMemo(
    () => new Set(lockedTagSlugs.map(slugifyEventTagName).filter(Boolean)),
    [lockedTagSlugs],
  );
  const visibleOptions = useMemo(() => (
    options
      .filter((option) => !isEventTypeTag(option))
      .filter((option) => !selectedIdentities.has(tagIdentity(option)))
      .filter((option) => (
        !normalizedSearch ||
        option.name.toLowerCase().includes(normalizedSearch.toLowerCase()) ||
        tagIdentity(option).includes(slugifyEventTagName(normalizedSearch))
      ))
      .sort((a, b) => {
        const countDiff = (b.eventCount ?? 0) - (a.eventCount ?? 0);
        return countDiff || a.name.localeCompare(b.name);
      })
      .slice(0, 5)
  ), [normalizedSearch, options, selectedIdentities]);

  const addTag = (tag: EventTag) => {
    const name = normalizeTagName(tag.name);
    if (!name) {
      return;
    }
    const identity = tag.slug ? slugifyEventTagName(tag.slug) : slugifyEventTagName(name);
    if (selectedIdentities.has(identity)) {
      setSearch('');
      return;
    }
    onChange([...value, { ...tag, name, slug: identity }]);
    setSearch('');
    setOpened(true);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  };

  const addTypedTag = () => {
    if (!normalizedSearch) {
      return;
    }
    const typedIdentity = slugifyEventTagName(normalizedSearch);
    if (isEventTypeTag({ name: normalizedSearch, slug: typedIdentity })) {
      setSearch('');
      return;
    }
    const exactMatch = options.find((option) => tagIdentity(option) === typedIdentity);
    addTag(exactMatch ?? { name: normalizedSearch, slug: typedIdentity, isSystem: false });
  };

  const removeTag = (identity: string) => {
    if (lockedIdentities.has(identity)) {
      return;
    }
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
                  styles={tagPillStyles(tag)}
                  withRemoveButton={!disabled && !lockedIdentities.has(identity)}
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
                  const lastRemovableTag = [...value]
                    .reverse()
                    .find((tag) => !lockedIdentities.has(tagIdentity(tag)));
                  if (lastRemovableTag) {
                    event.preventDefault();
                    removeTag(tagIdentity(lastRemovableTag));
                  }
                }
              }}
            />
          </Pill.Group>
        </PillsInput>
      </Popover.Target>
      <Popover.Dropdown p="xs">
        <ScrollArea.Autosize mah={220} type="auto">
          <Group gap="xs" align="center">
            {normalizedSearch &&
            !isEventTypeTag({ name: normalizedSearch, slug: slugifyEventTagName(normalizedSearch) }) &&
            !options.some((option) => tagIdentity(option) === slugifyEventTagName(normalizedSearch)) ? (
              <Button
                type="button"
                color="green"
                variant="light"
                radius="xl"
                size="compact-sm"
                disabled={selectedIdentities.has(slugifyEventTagName(normalizedSearch))}
                onClick={() => addTypedTag()}
              >
                {normalizedSearch}
              </Button>
            ) : null}
            {visibleOptions.map((option) => (
              <Button
                key={tagIdentity(option)}
                type="button"
                color={tagColor(option)}
                variant="light"
                radius="xl"
                size="compact-sm"
                onClick={() => addTag(option)}
              >
                {tagLabel(option)}
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
