'use client';

import { useMemo, useRef, useState } from 'react';
import { Button, Group, Pill, PillsInput, Popover, ScrollArea, Text } from '@mantine/core';
import type { OrganizationTag } from '@/types';

type OrganizationTagsInputProps = {
  value: OrganizationTag[];
  options: OrganizationTag[];
  disabled?: boolean;
  error?: string;
  onChange: (value: OrganizationTag[]) => void;
};

const normalizeTagName = (value: string): string => value.replace(/\s+/g, ' ').trim().slice(0, 40);
const slugifyOrganizationTagName = (value: string): string => (
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'tag'
);
const tagIdentity = (tag: Pick<OrganizationTag, 'name' | 'slug'>): string => (
  tag.slug ? slugifyOrganizationTagName(tag.slug) : slugifyOrganizationTagName(tag.name)
);
const tagLabel = (tag: OrganizationTag): string => `${tag.name} (${tag.organizationCount ?? 0})`;
const tagColor = (tag: OrganizationTag): 'blue' | 'green' => tag.isSystem ? 'blue' : 'green';
const tagPillStyles = (tag: OrganizationTag) => {
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

export function OrganizationTagsInput({ value, options, disabled = false, error, onChange }: OrganizationTagsInputProps) {
  const [search, setSearch] = useState('');
  const [opened, setOpened] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const normalizedSearch = normalizeTagName(search);
  const selectedIdentities = useMemo(
    () => new Set(value.map(tagIdentity)),
    [value],
  );
  const visibleOptions = useMemo(() => (
    options
      .filter((option) => !selectedIdentities.has(tagIdentity(option)))
      .filter((option) => (
        !normalizedSearch ||
        option.name.toLowerCase().includes(normalizedSearch.toLowerCase()) ||
        tagIdentity(option).includes(slugifyOrganizationTagName(normalizedSearch))
      ))
      .sort((a, b) => {
        const countDiff = (b.organizationCount ?? 0) - (a.organizationCount ?? 0);
        return countDiff || a.name.localeCompare(b.name);
      })
      .slice(0, 5)
  ), [normalizedSearch, options, selectedIdentities]);

  const addTag = (tag: OrganizationTag) => {
    const name = normalizeTagName(tag.name);
    if (!name) {
      return;
    }
    const identity = tag.slug ? slugifyOrganizationTagName(tag.slug) : slugifyOrganizationTagName(name);
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
    const typedIdentity = slugifyOrganizationTagName(normalizedSearch);
    const exactMatch = options.find((option) => tagIdentity(option) === typedIdentity);
    addTag(exactMatch ?? { name: normalizedSearch, slug: typedIdentity, isSystem: false });
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
                  styles={tagPillStyles(tag)}
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
            {normalizedSearch && !options.some((option) => tagIdentity(option) === slugifyOrganizationTagName(normalizedSearch)) ? (
              <Button
                type="button"
                color="green"
                variant="light"
                radius="xl"
                size="compact-sm"
                disabled={selectedIdentities.has(slugifyOrganizationTagName(normalizedSearch))}
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
