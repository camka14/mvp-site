'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Checkbox,
  Chip,
  ColorInput,
  Group,
  Loader,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
  Textarea,
  Title,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import type { Organization } from '@/types';
import { organizationService, type PublicSlugCheckResult } from '@/lib/organizationService';
import { resolveClientPublicOrigin } from '@/lib/clientPublicOrigin';
import { formatEnumDisplayLabel } from '@/lib/enumUtils';

type OrganizationPublicSettingsPanelProps = {
  organization: Organization;
  onUpdated: (organization: Organization) => void | Promise<void>;
};

const slugify = (value: string): string => (
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63)
    .replace(/-+$/g, '')
);

const splitDomains = (value: string): string[] => (
  value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
);

type WidgetSnippetOptions = {
  limit?: string;
  showDateFilter?: boolean;
  showEventTypeFilter?: boolean;
  dateRule?: 'all' | 'upcoming' | 'today' | 'week' | 'month';
  dateFrom?: string | null;
  dateTo?: string | null;
  eventTypes?: string[];
  includeChildWeeklyEvents?: boolean;
};

type WidgetKind = 'all' | 'events' | 'teams' | 'rentals' | 'products';
type WidgetDateRule = NonNullable<WidgetSnippetOptions['dateRule']>;

const WIDGET_KIND_OPTIONS: Array<{ value: WidgetKind; label: string }> = [
  { value: 'events', label: 'Events' },
  { value: 'all', label: 'All sections' },
  { value: 'teams', label: 'Teams' },
  { value: 'rentals', label: 'Rentals' },
  { value: 'products', label: 'Products' },
];

const DATE_RULE_OPTIONS: Array<{ value: WidgetDateRule; label: string }> = [
  { value: 'all', label: 'All dates' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'today', label: 'Starts today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
];

const EVENT_TYPE_OPTIONS = ['EVENT', 'TOURNAMENT', 'LEAGUE', 'WEEKLY_EVENT'] as const;

const getInitialPublicSlug = (organization: Organization): string => (
  organization.publicSlug ?? slugify(organization.name)
);

const BRAND_COLOR_SWATCHES = [
  '#0f766e',
  '#2563eb',
  '#7c3aed',
  '#dc2626',
  '#f59e0b',
  '#16a34a',
  '#111827',
  '#ffffff',
];

type SlugCheckStatus = 'idle' | 'checking' | 'available' | 'current' | 'taken' | 'invalid' | 'error';

type SlugCheckState = {
  status: SlugCheckStatus;
  checkedSlug: string | null;
  message: string;
};

const idleSlugCheck: SlugCheckState = {
  status: 'idle',
  checkedSlug: null,
  message: '',
};

const getSlugCheckState = (result: PublicSlugCheckResult): SlugCheckState => {
  if (!result.valid) {
    return {
      status: 'invalid',
      checkedSlug: result.slug,
      message: result.error ?? 'This slug is not valid.',
    };
  }
  if (result.current) {
    return {
      status: 'current',
      checkedSlug: result.slug,
      message: 'Current slug.',
    };
  }
  if (result.available) {
    return {
      status: 'available',
      checkedSlug: result.slug,
      message: 'Available.',
    };
  }
  return {
    status: 'taken',
    checkedSlug: result.slug,
    message: result.error ?? 'This public slug is already in use.',
  };
};

const normalizeLimitInput = (value: string): string => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return '6';
  }
  return String(Math.min(Math.max(parsed, 1), 24));
};

const formatDateParam = (value: Date | null): string | null => {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return null;
  }
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parsePickerDate = (value: unknown): Date | null => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
};

const widgetIncludesEvents = (kind: WidgetKind): boolean => kind === 'all' || kind === 'events';

const buildWidgetQuery = (options: WidgetSnippetOptions = {}): string => {
  const params = new URLSearchParams({ limit: normalizeLimitInput(options.limit ?? '6') });
  if (options.showDateFilter) params.set('showDateFilter', '1');
  if (options.showEventTypeFilter) params.set('showEventTypeFilter', '1');
  if (options.dateRule && options.dateRule !== 'all') params.set('dateRule', options.dateRule);
  if (options.dateFrom) params.set('dateFrom', options.dateFrom);
  if (options.dateTo) params.set('dateTo', options.dateTo);
  if (options.eventTypes?.length) params.set('eventTypes', options.eventTypes.join(','));
  if (options.includeChildWeeklyEvents === false) params.set('includeChildWeeklyEvents', '0');
  return params.toString();
};

const buildWidgetEmbedUrl = (
  origin: string,
  slug: string,
  kind: string,
  options: WidgetSnippetOptions = {},
): string => (
  `${origin}/embed/${slug}/${kind}?${buildWidgetQuery(options)}`
);

const buildIframeSnippet = (
  widgetUrl: string,
  kind: string,
): string => (
  `<iframe src="${widgetUrl}" title="BracketIQ ${kind}" width="100%" height="640" style="border:0;max-width:100%;" loading="lazy"></iframe>`
);

const buildScriptSnippet = (
  origin: string,
  slug: string,
  kind: string,
  options: WidgetSnippetOptions = {},
): string => {
  const attrs = [
    `data-bracketiq-widget`,
    `data-org="${slug}"`,
    `data-kind="${kind}"`,
    `data-limit="${normalizeLimitInput(options.limit ?? '6')}"`,
    options.showDateFilter ? `data-show-date-filter="1"` : '',
    options.showEventTypeFilter ? `data-show-event-type-filter="1"` : '',
    options.dateRule && options.dateRule !== 'all' ? `data-date-rule="${options.dateRule}"` : '',
    options.dateFrom ? `data-date-from="${options.dateFrom}"` : '',
    options.dateTo ? `data-date-to="${options.dateTo}"` : '',
    options.eventTypes?.length ? `data-event-types="${options.eventTypes.join(',')}"` : '',
    options.includeChildWeeklyEvents === false ? `data-include-child-weekly-events="0"` : '',
  ].filter(Boolean).join(' ');
  return `<div ${attrs}></div>\n<script async src="${origin}/embed.js"></script>`;
};

export default function OrganizationPublicSettingsPanel({
  organization,
  onUpdated,
}: OrganizationPublicSettingsPanelProps) {
  const [publicSlug, setPublicSlug] = useState(getInitialPublicSlug(organization));
  const [publicPageEnabled, setPublicPageEnabled] = useState(Boolean(organization.publicPageEnabled));
  const [publicWidgetsEnabled, setPublicWidgetsEnabled] = useState(Boolean(organization.publicWidgetsEnabled));
  const [brandPrimaryColor, setBrandPrimaryColor] = useState(organization.brandPrimaryColor ?? '#0f766e');
  const [brandAccentColor, setBrandAccentColor] = useState(organization.brandAccentColor ?? '#f59e0b');
  const [publicHeadline, setPublicHeadline] = useState(organization.publicHeadline ?? `${organization.name} on BracketIQ`);
  const [publicIntroText, setPublicIntroText] = useState(
    organization.publicIntroText ?? 'Find upcoming events, teams, rentals, and products.',
  );
  const [embedAllowedDomains, setEmbedAllowedDomains] = useState((organization.embedAllowedDomains ?? []).join(', '));
  const [publicCompletionRedirectUrl, setPublicCompletionRedirectUrl] = useState(
    organization.publicCompletionRedirectUrl ?? '',
  );
  const [widgetKind, setWidgetKind] = useState<WidgetKind>('events');
  const [widgetLimit, setWidgetLimit] = useState('6');
  const [snippetEventTypes, setSnippetEventTypes] = useState<string[]>([...EVENT_TYPE_OPTIONS]);
  const [snippetDateRule, setSnippetDateRule] = useState<WidgetDateRule>('all');
  const [snippetDateFrom, setSnippetDateFrom] = useState<Date | null>(null);
  const [snippetDateTo, setSnippetDateTo] = useState<Date | null>(null);
  const [snippetShowDateFilter, setSnippetShowDateFilter] = useState(true);
  const [snippetShowEventTypeFilter, setSnippetShowEventTypeFilter] = useState(true);
  const [snippetIncludeChildWeeklyEvents, setSnippetIncludeChildWeeklyEvents] = useState(true);
  const [slugCheck, setSlugCheck] = useState<SlugCheckState>(idleSlugCheck);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setPublicSlug(getInitialPublicSlug(organization));
    setPublicPageEnabled(Boolean(organization.publicPageEnabled));
    setPublicWidgetsEnabled(Boolean(organization.publicWidgetsEnabled));
    setBrandPrimaryColor(organization.brandPrimaryColor ?? '#0f766e');
    setBrandAccentColor(organization.brandAccentColor ?? '#f59e0b');
    setPublicHeadline(organization.publicHeadline ?? `${organization.name} on BracketIQ`);
    setPublicIntroText(organization.publicIntroText ?? 'Find upcoming events, teams, rentals, and products.');
    setEmbedAllowedDomains((organization.embedAllowedDomains ?? []).join(', '));
    setPublicCompletionRedirectUrl(organization.publicCompletionRedirectUrl ?? '');
  }, [organization]);

  const origin = useMemo(() => {
    const resolved = resolveClientPublicOrigin();
    if (resolved) {
      return resolved;
    }
    return typeof window !== 'undefined' ? window.location.origin : 'https://bracket-iq.com';
  }, []);

  const normalizedSlug = slugify(publicSlug);
  const organizationNameSlug = slugify(organization.name);
  const savedPublicSlug = organization.publicSlug ? slugify(organization.publicSlug) : '';
  const draftPublicPageUrl = normalizedSlug ? `${origin}/o/${normalizedSlug}` : '';
  const savedPublicPageUrl = savedPublicSlug ? `${origin}/o/${savedPublicSlug}` : '';
  const selectedAllEventTypes = snippetEventTypes.length === EVENT_TYPE_OPTIONS.length;
  const eventPresetOptions = {
    showDateFilter: snippetShowDateFilter,
    showEventTypeFilter: snippetShowEventTypeFilter,
    dateRule: snippetDateFrom || snippetDateTo ? 'all' : snippetDateRule,
    dateFrom: formatDateParam(snippetDateFrom),
    dateTo: formatDateParam(snippetDateTo),
    eventTypes: selectedAllEventTypes ? [] : snippetEventTypes,
    includeChildWeeklyEvents: snippetIncludeChildWeeklyEvents,
  } satisfies WidgetSnippetOptions;
  const widgetOptions: WidgetSnippetOptions = widgetIncludesEvents(widgetKind)
    ? { ...eventPresetOptions, limit: widgetLimit }
    : { limit: widgetLimit };
  const slugCheckIsPending = Boolean(normalizedSlug)
    && (slugCheck.status === 'checking' || slugCheck.checkedSlug !== normalizedSlug);
  const slugHasValidationError = Boolean(normalizedSlug) && slugCheck.status === 'invalid';
  const slugIsTaken = Boolean(normalizedSlug) && slugCheck.status === 'taken';
  const slugMissingForEnabledSurface = !normalizedSlug && (publicPageEnabled || publicWidgetsEnabled);
  const slugBlocksSave = slugCheckIsPending || slugHasValidationError || slugIsTaken || slugMissingForEnabledSurface;
  const showSlugStatusMessage = slugCheck.status === 'taken'
    || slugCheck.status === 'invalid'
    || slugCheck.status === 'error';
  const slugPreviewIsUsable = Boolean(normalizedSlug)
    && !slugCheckIsPending
    && !slugHasValidationError
    && !slugIsTaken;
  const slugMatchesSaved = Boolean(savedPublicSlug) && normalizedSlug === savedPublicSlug;
  const publicPageReady = slugPreviewIsUsable
    && slugMatchesSaved
    && publicPageEnabled
    && organization.publicPageEnabled === true;
  const widgetsReady = slugPreviewIsUsable
    && slugMatchesSaved
    && publicWidgetsEnabled
    && organization.publicWidgetsEnabled === true;
  const widgetPreviewUrl = widgetsReady && savedPublicSlug
    ? buildWidgetEmbedUrl(origin, savedPublicSlug, widgetKind, widgetOptions)
    : '';
  const eventsIframeSnippet = widgetPreviewUrl ? buildIframeSnippet(widgetPreviewUrl, widgetKind) : '';
  const allScriptSnippet = widgetsReady ? buildScriptSnippet(origin, savedPublicSlug, widgetKind, widgetOptions) : '';
  const previewHelpMessage = (() => {
    if (!normalizedSlug) {
      return 'Set a slug before opening previews or copying snippets.';
    }
    if (slugCheckIsPending) {
      return 'Checking slug availability before previews can be opened.';
    }
    if (slugHasValidationError || slugIsTaken) {
      return slugCheck.message || 'Choose an available slug before opening previews.';
    }
    if (!slugMatchesSaved) {
      return 'Save this slug before opening previews or copying snippets.';
    }
    if (publicPageEnabled !== organization.publicPageEnabled || publicWidgetsEnabled !== organization.publicWidgetsEnabled) {
      return 'Save the enable changes before opening previews.';
    }
    if (!publicPageReady && !widgetsReady) {
      return 'Enable and save the public page or widgets before opening previews.';
    }
    if (!publicPageReady) {
      return 'Enable and save the public page before opening it.';
    }
    if (!widgetsReady) {
      return 'Enable and save widgets before opening or copying widget embeds.';
    }
    return '';
  })();

  useEffect(() => {
    if (!normalizedSlug) {
      setSlugCheck({
        status: 'invalid',
        checkedSlug: null,
        message: publicPageEnabled || publicWidgetsEnabled ? 'Set a slug before enabling the public page or widgets.' : '',
      });
      return undefined;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      setSlugCheck({
        status: 'checking',
        checkedSlug: normalizedSlug,
        message: 'Checking availability.',
      });
      organizationService
        .checkPublicSlug(normalizedSlug, organization.$id ?? '', { signal: controller.signal })
        .then((result) => {
          if (!controller.signal.aborted) {
            setSlugCheck(getSlugCheckState(result));
          }
        })
        .catch((error) => {
          if (controller.signal.aborted) {
            return;
          }
          setSlugCheck({
            status: 'error',
            checkedSlug: normalizedSlug,
            message: error instanceof Error ? error.message : 'Could not check slug availability.',
          });
        });
    }, 350);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [normalizedSlug, organization.$id, publicPageEnabled, publicWidgetsEnabled]);

  const slugStatusColor = (() => {
    if (slugCheckIsPending) {
      return 'gray';
    }
    if (slugCheck.status === 'available' || slugCheck.status === 'current') {
      return 'green';
    }
    if (slugCheck.status === 'taken' || slugCheck.status === 'invalid') {
      return 'red';
    }
    return 'yellow';
  })();

  const slugStatusLabel = (() => {
    if (!normalizedSlug) {
      return publicPageEnabled || publicWidgetsEnabled ? 'Required' : 'Not set';
    }
    if (slugCheckIsPending) {
      return 'Checking';
    }
    if (slugCheck.status === 'available') {
      return 'Available';
    }
    if (slugCheck.status === 'current') {
      return 'Current';
    }
    if (slugCheck.status === 'taken') {
      return 'In use';
    }
    if (slugCheck.status === 'invalid') {
      return 'Invalid';
    }
    return 'Check failed';
  })();

  const copySnippet = async (value: string, label: string) => {
    if (!value) {
      return;
    }
    await navigator.clipboard.writeText(value);
    notifications.show({ color: 'green', message: `${label} copied.` });
  };

  const handleSave = async () => {
    if (!organization.$id) {
      return;
    }
    if (slugBlocksSave) {
      notifications.show({
        color: 'red',
        message: slugMissingForEnabledSurface
          ? 'Set an available public slug before enabling the public page or widgets.'
          : slugCheck.message || 'Choose an available public slug before saving.',
      });
      return;
    }
    setSaving(true);
    try {
      const updated = await organizationService.updateOrganization(organization.$id, {
        publicSlug: normalizedSlug || null,
        publicPageEnabled,
        publicWidgetsEnabled,
        brandPrimaryColor: brandPrimaryColor || null,
        brandAccentColor: brandAccentColor || null,
        publicHeadline,
        publicIntroText,
        embedAllowedDomains: splitDomains(embedAllowedDomains),
        publicCompletionRedirectUrl: publicCompletionRedirectUrl.trim() || null,
      });
      await onUpdated(updated);
      notifications.show({ color: 'green', message: 'Public page settings saved.' });
    } catch (error) {
      notifications.show({
        color: 'red',
        message: error instanceof Error ? error.message : 'Failed to save public page settings.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack gap="lg">
      <Paper withBorder p="md" radius="md">
        <Group justify="space-between" align="flex-start" mb="md">
          <div>
            <Title order={5}>Public page and widgets</Title>
            <Text size="sm" c="dimmed">
              Publish a branded organization page and embed BracketIQ widgets on client websites.
            </Text>
          </div>
          <Button onClick={handleSave} loading={saving} disabled={slugBlocksSave && !saving}>Save</Button>
        </Group>

        <Group align="flex-end" gap="sm" wrap="wrap">
          <TextInput
            label="Public slug"
            description="Used in /o/slug and /embed/slug URLs."
            value={publicSlug}
            onChange={(event) => setPublicSlug(slugify(event.currentTarget.value))}
            placeholder={organizationNameSlug || 'organization-name'}
            style={{ flex: '1 1 320px', minWidth: 260 }}
          />
          <Button variant="default" onClick={() => setPublicSlug(slugify(organization.name))}>
            Use organization name
          </Button>
          <ColorInput
            label="Primary color"
            description="Choose a color or paste a hex value."
            value={brandPrimaryColor}
            onChange={setBrandPrimaryColor}
            placeholder="#0f766e"
            format="hex"
            swatches={BRAND_COLOR_SWATCHES}
            style={{ flex: '1 1 220px', minWidth: 190 }}
          />
          <ColorInput
            label="Accent color"
            description="Choose a color or paste a hex value."
            value={brandAccentColor}
            onChange={setBrandAccentColor}
            placeholder="#f59e0b"
            format="hex"
            swatches={BRAND_COLOR_SWATCHES}
            style={{ flex: '1 1 220px', minWidth: 190 }}
          />
          <Stack gap={6} style={{ flex: '0 1 170px', minWidth: 150 }}>
            <Text size="sm" fw={500}>Public page</Text>
            <Switch
              label="Enable"
              checked={publicPageEnabled}
              onChange={(event) => setPublicPageEnabled(event.currentTarget.checked)}
            />
          </Stack>
          <Stack gap={6} style={{ flex: '0 1 170px', minWidth: 150 }}>
            <Text size="sm" fw={500}>Widgets</Text>
            <Switch
              label="Enable"
              checked={publicWidgetsEnabled}
              onChange={(event) => setPublicWidgetsEnabled(event.currentTarget.checked)}
            />
          </Stack>
        </Group>

        <Group gap="xs" wrap="wrap" mt="xs">
          <Text size="xs" c="dimmed">
            Preview slug:{' '}
            <Text span fw={700} c="dark">
              {normalizedSlug || organizationNameSlug || 'organization-name'}
            </Text>
          </Text>
          {slugCheckIsPending ? <Loader size="xs" /> : null}
          <Badge size="xs" variant="light" color={slugStatusColor}>
            {slugStatusLabel}
          </Badge>
          {normalizedSlug ? (
            <Text size="xs" c="dimmed">
              Public page: {draftPublicPageUrl}
            </Text>
          ) : null}
        </Group>
        {showSlugStatusMessage && slugCheck.message ? (
          <Text size="xs" c={slugStatusColor === 'red' ? 'red' : 'dimmed'} mt={4}>
            {slugCheck.message}
          </Text>
        ) : null}

        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md" mt="md">
          <Textarea
            label="Public headline"
            value={publicHeadline}
            onChange={(event) => setPublicHeadline(event.currentTarget.value)}
            autosize
            minRows={2}
          />
          <Textarea
            label="Public intro text"
            value={publicIntroText}
            onChange={(event) => setPublicIntroText(event.currentTarget.value)}
            autosize
            minRows={2}
          />
        </SimpleGrid>
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md" mt="md">
          <TextInput
            label="Allowed embed domains"
            description="Optional comma-separated hostnames. Leave blank for broad embed testing."
            value={embedAllowedDomains}
            onChange={(event) => setEmbedAllowedDomains(event.currentTarget.value)}
            placeholder="example.com, www.example.com"
          />
          <TextInput
            label="Completion redirect URL"
            description="Optional. Send public customers here after registrations, rentals, or purchases."
            value={publicCompletionRedirectUrl}
            onChange={(event) => setPublicCompletionRedirectUrl(event.currentTarget.value)}
            placeholder="https://example.com/thank-you"
          />
        </SimpleGrid>
      </Paper>

      <Paper withBorder p="md" radius="md">
        <Title order={5} mb="sm">Preview and snippets</Title>
        <Stack gap="sm">
          <Group>
            <Button component="a" href={savedPublicPageUrl || '#'} target="_blank" rel="noreferrer" disabled={!publicPageReady}>
              Open public page
            </Button>
            <Button
              component="a"
              href={widgetPreviewUrl || '#'}
              target="_blank"
              rel="noreferrer"
              variant="default"
              disabled={!widgetPreviewUrl}
            >
              Open widget preview
            </Button>
          </Group>
          {previewHelpMessage ? (
            <Text size="sm" c="dimmed">
              {previewHelpMessage}
            </Text>
          ) : null}
          <Stack gap="sm">
            <div>
              <Title order={6}>Widget preset builder</Title>
              <Text size="sm" c="dimmed">
                Build the iframe and script snippets with the same event filters visitors use on event lists.
              </Text>
            </div>
            <Group align="flex-end" gap="sm" wrap="wrap">
              <Select
                label="Widget"
                data={WIDGET_KIND_OPTIONS}
                value={widgetKind}
                onChange={(value) => setWidgetKind((value as WidgetKind | null) ?? 'events')}
                style={{ flex: '1 1 150px', minWidth: 140 }}
              />
              <TextInput
                label="Data limit"
                inputMode="numeric"
                value={widgetLimit}
                onChange={(event) => setWidgetLimit(event.currentTarget.value.replace(/\D/g, '').slice(0, 2))}
                onBlur={() => setWidgetLimit(normalizeLimitInput(widgetLimit))}
                style={{ flex: '0 1 110px', minWidth: 100 }}
              />
              <Select
                label="Date preset"
                data={DATE_RULE_OPTIONS}
                value={snippetDateRule}
                onChange={(value) => setSnippetDateRule((value as WidgetDateRule | null) ?? 'all')}
                style={{ flex: '1 1 150px', minWidth: 140 }}
              />
              <DatePickerInput
                label="Start date"
                value={snippetDateFrom}
                onChange={(value) => setSnippetDateFrom(parsePickerDate(value))}
                clearable
                valueFormat="MMM D, YYYY"
                placeholder="No start date"
                highlightToday
                style={{ flex: '1 1 160px', minWidth: 150 }}
              />
              <DatePickerInput
                label="End date"
                value={snippetDateTo}
                onChange={(value) => setSnippetDateTo(parsePickerDate(value))}
                clearable
                valueFormat="MMM D, YYYY"
                placeholder="No end date"
                minDate={snippetDateFrom ?? undefined}
                highlightToday
                style={{ flex: '1 1 160px', minWidth: 150 }}
              />
              <Stack gap={6} style={{ flex: '2 1 380px', minWidth: 300 }}>
                <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                  Event Type
                </Text>
                <Group gap="xs" wrap="wrap">
                  <Chip
                    radius="xl"
                    checked={selectedAllEventTypes}
                    onChange={(checked) => setSnippetEventTypes(checked ? [...EVENT_TYPE_OPTIONS] : [])}
                  >
                    All
                  </Chip>
                  {EVENT_TYPE_OPTIONS.map((type) => (
                    <Chip
                      key={type}
                      radius="xl"
                      checked={snippetEventTypes.includes(type)}
                      onChange={(checked) => {
                        if (checked) {
                          const next = new Set(snippetEventTypes);
                          next.add(type);
                          setSnippetEventTypes(EVENT_TYPE_OPTIONS.filter((option) => next.has(option)));
                        } else {
                          setSnippetEventTypes(snippetEventTypes.filter((value) => value !== type));
                        }
                      }}
                    >
                      {formatEnumDisplayLabel(type, 'Event')}
                    </Chip>
                  ))}
                </Group>
              </Stack>

              <Stack gap={6} style={{ flex: '1 1 340px', minWidth: 280 }}>
                <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                  Widget Controls
                </Text>
                <Group gap="sm" wrap="wrap">
                  <Checkbox
                    checked={snippetShowDateFilter}
                    onChange={(event) => setSnippetShowDateFilter(event.currentTarget.checked)}
                    label="Date filter"
                  />
                  <Checkbox
                    checked={snippetShowEventTypeFilter}
                    onChange={(event) => setSnippetShowEventTypeFilter(event.currentTarget.checked)}
                    label="Event type filter"
                  />
                    <Checkbox
                      checked={!snippetIncludeChildWeeklyEvents}
                      onChange={(event) => setSnippetIncludeChildWeeklyEvents(!event.currentTarget.checked)}
                      label="Hide weekly events"
                    />
                </Group>
              </Stack>
            </Group>
          </Stack>
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
            <Stack gap="xs">
              <Textarea label="Iframe snippet" value={eventsIframeSnippet} readOnly autosize minRows={4} />
              <Button variant="default" onClick={() => copySnippet(eventsIframeSnippet, 'Iframe snippet')} disabled={!eventsIframeSnippet || !widgetsReady}>
                Copy iframe snippet
              </Button>
            </Stack>
            <Stack gap="xs">
              <Textarea label="Script snippet" value={allScriptSnippet} readOnly autosize minRows={4} />
              <Button variant="default" onClick={() => copySnippet(allScriptSnippet, 'Script snippet')} disabled={!allScriptSnippet || !widgetsReady}>
                Copy script snippet
              </Button>
            </Stack>
          </SimpleGrid>
        </Stack>
      </Paper>
    </Stack>
  );
}
