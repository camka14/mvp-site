'use client';

import type { CSSProperties } from 'react';
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
import { eventService } from '@/lib/eventService';
import { organizationService, type PublicSlugCheckResult } from '@/lib/organizationService';
import { resolveClientPublicOrigin } from '@/lib/clientPublicOrigin';
import { formatEnumDisplayLabel } from '@/lib/enumUtils';
import type { Event, EventType, Organization } from '@/types';

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
  eventIds?: string[];
  divisionId?: string | null;
  includeChildWeeklyEvents?: boolean;
  teamOpenRegistrationOnly?: boolean;
  productPurchaseMode?: 'all' | 'single' | 'subscription';
};

type WidgetKind = 'all' | 'events' | 'teams' | 'rentals' | 'products' | 'standings' | 'brackets';
type WidgetDateRule = NonNullable<WidgetSnippetOptions['dateRule']>;
type WidgetProductPurchaseMode = NonNullable<WidgetSnippetOptions['productPurchaseMode']>;
type WidgetSectionKind = Exclude<WidgetKind, 'all'>;
type WidgetEventSelection = {
  id: string;
  name: string;
  eventType: string;
  start: string | null;
};
type WidgetEventSelectionDateRule = Extract<WidgetDateRule, 'all' | 'upcoming'>;

const WIDGET_KIND_OPTIONS: Array<{ value: WidgetKind; label: string }> = [
  { value: 'events', label: 'Events' },
  { value: 'standings', label: 'Standings preview' },
  { value: 'brackets', label: 'Bracket view' },
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
const WIDGET_EVENT_SELECTION_DATE_RULE_OPTIONS: Array<{ value: WidgetEventSelectionDateRule; label: string }> = [
  { value: 'upcoming', label: 'Upcoming events' },
  { value: 'all', label: 'All events' },
];

const EVENT_TYPE_OPTIONS = ['EVENT', 'TOURNAMENT', 'LEAGUE', 'WEEKLY_EVENT'] as const;
const STANDINGS_EVENT_TYPE_OPTIONS: EventType[] = ['LEAGUE'];
const BRACKETS_EVENT_TYPE_OPTIONS: EventType[] = ['LEAGUE', 'TOURNAMENT'];
const PRODUCT_PURCHASE_MODE_OPTIONS: Array<{ value: WidgetProductPurchaseMode; label: string }> = [
  { value: 'all', label: 'Both' },
  { value: 'single', label: 'Single purchase' },
  { value: 'subscription', label: 'Subscription' },
];
const WIDGET_TYPE_CONTROL_WIDTH = 216;
const buildResponsiveWidthRange = (
  minWidth: number,
  grow: number = 1,
): CSSProperties => ({
  flex: `${grow} 1 ${minWidth}px`,
  minWidth: `min(100%, ${minWidth}px)`,
  maxWidth: `min(100%, ${Math.round(minWidth * 1.25)}px)`,
});
const SECTION_WIDTH_STYLES = {
  common: buildResponsiveWidthRange(180),
  events: buildResponsiveWidthRange(720),
  teams: buildResponsiveWidthRange(320),
  products: buildResponsiveWidthRange(220),
  selection: buildResponsiveWidthRange(720),
} satisfies Record<'common' | 'events' | 'teams' | 'products' | 'selection', CSSProperties>;
const EVENT_CONTROL_WIDTH_STYLES = {
  datePreset: buildResponsiveWidthRange(160),
  startDate: buildResponsiveWidthRange(170),
  endDate: buildResponsiveWidthRange(170),
  eventType: buildResponsiveWidthRange(380),
  widgetControls: buildResponsiveWidthRange(300),
} satisfies Record<'datePreset' | 'startDate' | 'endDate' | 'eventType' | 'widgetControls', CSSProperties>;

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
const widgetIncludesStandings = (kind: WidgetKind): boolean => kind === 'standings';
const widgetIncludesBrackets = (kind: WidgetKind): boolean => kind === 'brackets';
const widgetIncludesTeams = (kind: WidgetKind): boolean => kind === 'all' || kind === 'teams';
const widgetIncludesProducts = (kind: WidgetKind): boolean => kind === 'all' || kind === 'products';
const getVisibleWidgetSections = (kind: WidgetKind): WidgetSectionKind[] => (
  kind === 'all' ? ['events', 'teams', 'rentals', 'products'] : [kind]
);

const buildWidgetQuery = (options: WidgetSnippetOptions = {}): string => {
  const params = new URLSearchParams();
  if (options.limit) params.set('limit', normalizeLimitInput(options.limit));
  if (options.showDateFilter) params.set('showDateFilter', '1');
  if (options.showEventTypeFilter) params.set('showEventTypeFilter', '1');
  if (options.dateRule && options.dateRule !== 'all') params.set('dateRule', options.dateRule);
  if (options.dateFrom) params.set('dateFrom', options.dateFrom);
  if (options.dateTo) params.set('dateTo', options.dateTo);
  if (options.eventTypes?.length) params.set('eventTypes', options.eventTypes.join(','));
  if (options.eventIds?.length) params.set('eventIds', options.eventIds.join(','));
  if (options.divisionId) params.set('divisionId', options.divisionId);
  if (options.includeChildWeeklyEvents === false) params.set('includeChildWeeklyEvents', '0');
  if (options.teamOpenRegistrationOnly) params.set('teamOpenRegistrationOnly', '1');
  if (options.productPurchaseMode && options.productPurchaseMode !== 'all') {
    params.set('productPurchaseMode', options.productPurchaseMode);
  }
  return params.toString();
};

const buildWidgetEmbedUrl = (
  origin: string,
  slug: string,
  kind: string,
  options: WidgetSnippetOptions = {},
): string => {
  const query = buildWidgetQuery(options);
  return `${origin}/embed/${slug}/${kind}${query ? `?${query}` : ''}`;
};

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
    options.limit ? `data-limit="${normalizeLimitInput(options.limit)}"` : '',
    options.showDateFilter ? `data-show-date-filter="1"` : '',
    options.showEventTypeFilter ? `data-show-event-type-filter="1"` : '',
    options.dateRule && options.dateRule !== 'all' ? `data-date-rule="${options.dateRule}"` : '',
    options.dateFrom ? `data-date-from="${options.dateFrom}"` : '',
    options.dateTo ? `data-date-to="${options.dateTo}"` : '',
    options.eventTypes?.length ? `data-event-types="${options.eventTypes.join(',')}"` : '',
    options.eventIds?.length ? `data-event-ids="${options.eventIds.join(',')}"` : '',
    options.divisionId ? `data-division-id="${options.divisionId}"` : '',
    options.includeChildWeeklyEvents === false ? `data-include-child-weekly-events="0"` : '',
    options.teamOpenRegistrationOnly ? `data-team-open-registration-only="1"` : '',
    options.productPurchaseMode && options.productPurchaseMode !== 'all'
      ? `data-product-purchase-mode="${options.productPurchaseMode}"`
      : '',
  ].filter(Boolean).join(' ');
  return `<div ${attrs}></div>\n<script async src="${origin}/embed.js"></script>`;
};

const formatWidgetEventDate = (value: string | null): string => {
  if (!value) {
    return 'Date TBD';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Date TBD';
  }
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed);
};

const toWidgetEventSelection = (event: Event): WidgetEventSelection | null => {
  const id = typeof event.$id === 'string' ? event.$id.trim() : '';
  const name = typeof event.name === 'string' ? event.name.trim() : '';
  if (!id || !name) {
    return null;
  }
  const rawStart = event.start as unknown;
  const start = rawStart instanceof Date
    ? rawStart.toISOString()
    : typeof rawStart === 'string'
      ? rawStart
      : null;
  return {
    id,
    name,
    eventType: typeof event.eventType === 'string' ? event.eventType : 'EVENT',
    start,
  };
};

type WidgetEventSearchPickerProps = {
  label: string;
  description: string;
  organizationId?: string;
  eventTypes: EventType[];
  selectedEvents: WidgetEventSelection[];
  onChange: (events: WidgetEventSelection[]) => void;
};

function WidgetEventSearchPicker({
  label,
  description,
  organizationId,
  eventTypes,
  selectedEvents,
  onChange,
}: WidgetEventSearchPickerProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<WidgetEventSelection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalizedQuery = query.trim();
  const selectedIds = useMemo(() => new Set(selectedEvents.map((event) => event.id)), [selectedEvents]);
  const eventTypesKey = eventTypes.join(',');

  useEffect(() => {
    if (!organizationId || !normalizedQuery) {
      setResults([]);
      setLoading(false);
      setError(null);
      return undefined;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      eventService
        .getEventsPaginated(
          {
            query: normalizedQuery,
            organizationId,
            eventTypes,
          },
          8,
          0,
        )
        .then((events) => {
          if (cancelled) {
            return;
          }
          setResults(
            events
              .map((event) => toWidgetEventSelection(event))
              .filter((event): event is WidgetEventSelection => Boolean(event))
              .filter((event) => !selectedIds.has(event.id)),
          );
        })
        .catch((searchError) => {
          if (cancelled) {
            return;
          }
          setResults([]);
          setError(searchError instanceof Error ? searchError.message : 'Failed to search events.');
        })
        .finally(() => {
          if (!cancelled) {
            setLoading(false);
          }
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [eventTypes, eventTypesKey, normalizedQuery, organizationId, selectedIds]);

  const addEvent = (event: WidgetEventSelection) => {
    if (selectedIds.has(event.id)) {
      return;
    }
    onChange([...selectedEvents, event]);
    setQuery('');
    setResults([]);
    setError(null);
  };

  const removeEvent = (eventId: string) => {
    onChange(selectedEvents.filter((event) => event.id !== eventId));
  };

  return (
    <Stack gap="xs">
      <TextInput
        label={label}
        description={description}
        placeholder="Search events by name"
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
        disabled={!organizationId}
      />

      {selectedEvents.length ? (
        <Stack gap="xs">
          {selectedEvents.map((event) => (
            <Paper key={event.id} withBorder p="xs" radius="md">
              <Group justify="space-between" align="flex-start" wrap="nowrap">
                <div>
                  <Text size="sm" fw={600}>{event.name}</Text>
                  <Text size="xs" c="dimmed">
                    {formatEnumDisplayLabel(event.eventType, 'Event')} - {formatWidgetEventDate(event.start)}
                  </Text>
                </div>
                <Button variant="subtle" size="xs" onClick={() => removeEvent(event.id)}>
                  Remove
                </Button>
              </Group>
            </Paper>
          ))}
        </Stack>
      ) : (
        <Text size="xs" c="dimmed">
          No specific events selected. The widget will use the date rule instead.
        </Text>
      )}

      <Text size="xs" c="dimmed">
        Selected events override the date rule and stay in the order added.
      </Text>

      {normalizedQuery ? (
        <Paper withBorder p="xs" radius="md">
          <Stack gap="xs">
            {loading ? <Loader size="sm" /> : null}
            {!loading && error ? <Text size="xs" c="red">{error}</Text> : null}
            {!loading && !error && !results.length ? (
              <Text size="xs" c="dimmed">No matching events found.</Text>
            ) : null}
            {!loading && !error ? results.map((event) => (
              <Paper key={event.id} withBorder p="xs" radius="md">
                <Group justify="space-between" align="center" wrap="nowrap">
                  <div>
                    <Text size="sm" fw={600}>{event.name}</Text>
                    <Text size="xs" c="dimmed">
                      {formatEnumDisplayLabel(event.eventType, 'Event')} - {formatWidgetEventDate(event.start)}
                    </Text>
                  </div>
                  <Button size="xs" variant="light" onClick={() => addEvent(event)}>
                    Add
                  </Button>
                </Group>
              </Paper>
            )) : null}
          </Stack>
        </Paper>
      ) : null}
    </Stack>
  );
}

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
  const [snippetTeamOpenRegistrationOnly, setSnippetTeamOpenRegistrationOnly] = useState(false);
  const [snippetProductPurchaseMode, setSnippetProductPurchaseMode] = useState<WidgetProductPurchaseMode>('all');
  const [standingsShowDateFilter, setStandingsShowDateFilter] = useState(true);
  const [standingsDateRule, setStandingsDateRule] = useState<WidgetEventSelectionDateRule>('upcoming');
  const [standingsSelectedEvents, setStandingsSelectedEvents] = useState<WidgetEventSelection[]>([]);
  const [bracketsShowDateFilter, setBracketsShowDateFilter] = useState(true);
  const [bracketsDateRule, setBracketsDateRule] = useState<WidgetEventSelectionDateRule>('upcoming');
  const [bracketsSelectedEvents, setBracketsSelectedEvents] = useState<WidgetEventSelection[]>([]);
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
    setStandingsSelectedEvents([]);
    setBracketsSelectedEvents([]);
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
  const visibleWidgetSections = getVisibleWidgetSections(widgetKind);
  const eventPresetOptions = {
    showDateFilter: snippetShowDateFilter,
    showEventTypeFilter: snippetShowEventTypeFilter,
    dateRule: snippetDateFrom || snippetDateTo ? 'all' : snippetDateRule,
    dateFrom: formatDateParam(snippetDateFrom),
    dateTo: formatDateParam(snippetDateTo),
    eventTypes: selectedAllEventTypes ? [] : snippetEventTypes,
    includeChildWeeklyEvents: snippetIncludeChildWeeklyEvents,
  } satisfies WidgetSnippetOptions;
  const standingsPresetOptions = {
    showDateFilter: standingsShowDateFilter,
    dateRule: standingsDateRule,
    eventIds: standingsSelectedEvents.map((event) => event.id),
  } satisfies WidgetSnippetOptions;
  const bracketPresetOptions = {
    showDateFilter: bracketsShowDateFilter,
    dateRule: bracketsDateRule,
    eventIds: bracketsSelectedEvents.map((event) => event.id),
  } satisfies WidgetSnippetOptions;
  const widgetOptions: WidgetSnippetOptions = (
    widgetIncludesStandings(widgetKind)
      ? standingsPresetOptions
      : widgetIncludesBrackets(widgetKind)
        ? bracketPresetOptions
        : {
            limit: widgetLimit,
            ...(widgetIncludesEvents(widgetKind) ? eventPresetOptions : {}),
            ...(widgetIncludesTeams(widgetKind) ? { teamOpenRegistrationOnly: snippetTeamOpenRegistrationOnly } : {}),
            ...(widgetIncludesProducts(widgetKind) ? { productPurchaseMode: snippetProductPurchaseMode } : {}),
          }
  );
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
  const iframeSnippet = widgetPreviewUrl ? buildIframeSnippet(widgetPreviewUrl, widgetKind) : '';
  const scriptSnippet = widgetsReady ? buildScriptSnippet(origin, savedPublicSlug, widgetKind, widgetOptions) : '';
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
          <Group align="flex-end" gap="sm" wrap="wrap">
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
            <Select
              label="Widget type"
              data={WIDGET_KIND_OPTIONS}
              value={widgetKind}
              onChange={(value) => setWidgetKind((value as WidgetKind | null) ?? 'events')}
              style={{ width: WIDGET_TYPE_CONTROL_WIDTH, minWidth: WIDGET_TYPE_CONTROL_WIDTH, maxWidth: WIDGET_TYPE_CONTROL_WIDTH }}
            />
          </Group>
          {previewHelpMessage ? (
            <Text size="sm" c="dimmed">
              {previewHelpMessage}
            </Text>
          ) : null}
          <div>
            <Title order={6}>Widget preset builder</Title>
            <Text size="sm" c="dimmed">
              Build iframe and script snippets with the same public filters visitors should see in each widget section.
            </Text>
          </div>
          <Group align="stretch" gap="md" wrap="wrap">
            <Paper withBorder p="sm" radius="md" style={SECTION_WIDTH_STYLES.common}>
              <Stack gap="xs">
                <Title order={6}>Common settings</Title>
                {widgetIncludesStandings(widgetKind) || widgetIncludesBrackets(widgetKind) ? (
                  <Text size="sm" c="dimmed">
                    Standings and bracket widgets page through one event at a time, so there is no card limit to set here.
                  </Text>
                ) : (
                  <Group align="flex-end" gap="sm" wrap="wrap">
                    <TextInput
                      label="Data limit"
                      inputMode="numeric"
                      value={widgetLimit}
                      onChange={(event) => setWidgetLimit(event.currentTarget.value.replace(/\D/g, '').slice(0, 2))}
                      onBlur={() => setWidgetLimit(normalizeLimitInput(widgetLimit))}
                      style={{ flex: '0 1 110px', minWidth: 100 }}
                    />
                  </Group>
                )}
              </Stack>
            </Paper>

            {visibleWidgetSections.includes('events') ? (
              <Paper withBorder p="sm" radius="md" style={SECTION_WIDTH_STYLES.events}>
                <Stack gap="xs">
                  <Title order={6}>Events settings</Title>
                  <Group align="flex-end" gap="sm" wrap="wrap">
                    <Select
                      label="Date preset"
                      data={DATE_RULE_OPTIONS}
                      value={snippetDateRule}
                      onChange={(value) => setSnippetDateRule((value as WidgetDateRule | null) ?? 'all')}
                      style={EVENT_CONTROL_WIDTH_STYLES.datePreset}
                    />
                    <DatePickerInput
                      label="Start date"
                      value={snippetDateFrom}
                      onChange={(value) => setSnippetDateFrom(parsePickerDate(value))}
                      clearable
                      valueFormat="MMM D, YYYY"
                      placeholder="No start date"
                      highlightToday
                      style={EVENT_CONTROL_WIDTH_STYLES.startDate}
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
                      style={EVENT_CONTROL_WIDTH_STYLES.endDate}
                    />
                    <Stack gap={6} style={EVENT_CONTROL_WIDTH_STYLES.eventType}>
                      <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                        Event type
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
                    <Stack gap={6} style={EVENT_CONTROL_WIDTH_STYLES.widgetControls}>
                      <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                        Widget controls
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
              </Paper>
            ) : null}

            {visibleWidgetSections.includes('teams') ? (
              <Paper withBorder p="sm" radius="md" style={SECTION_WIDTH_STYLES.teams}>
                <Stack gap="xs">
                  <Title order={6}>Teams settings</Title>
                  <Group align="flex-end" gap="sm" wrap="wrap">
                    <Checkbox
                      checked={snippetTeamOpenRegistrationOnly}
                      onChange={(event) => setSnippetTeamOpenRegistrationOnly(event.currentTarget.checked)}
                      label="Only show teams with open registration"
                    />
                  </Group>
                </Stack>
              </Paper>
            ) : null}

            {visibleWidgetSections.includes('products') ? (
              <Paper withBorder p="sm" radius="md" style={SECTION_WIDTH_STYLES.products}>
                <Stack gap="xs">
                  <Title order={6}>Products settings</Title>
                  <Group align="flex-end" gap="sm" wrap="wrap">
                    <Select
                      label="Show"
                      data={PRODUCT_PURCHASE_MODE_OPTIONS}
                      value={snippetProductPurchaseMode}
                      onChange={(value) => setSnippetProductPurchaseMode((value as WidgetProductPurchaseMode | null) ?? 'all')}
                      style={buildResponsiveWidthRange(200)}
                    />
                  </Group>
                </Stack>
              </Paper>
            ) : null}

            {visibleWidgetSections.includes('standings') ? (
              <Paper withBorder p="sm" radius="md" style={SECTION_WIDTH_STYLES.selection}>
                <Stack gap="sm">
                  <Title order={6}>Standings settings</Title>
                  <Group align="flex-end" gap="sm" wrap="wrap">
                    <Select
                      label="Default event set"
                      data={WIDGET_EVENT_SELECTION_DATE_RULE_OPTIONS}
                      value={standingsDateRule}
                      onChange={(value) => setStandingsDateRule((value as WidgetEventSelectionDateRule | null) ?? 'upcoming')}
                      style={EVENT_CONTROL_WIDTH_STYLES.datePreset}
                    />
                    <Checkbox
                      checked={standingsShowDateFilter}
                      onChange={(event) => setStandingsShowDateFilter(event.currentTarget.checked)}
                      label="Show date filter"
                    />
                  </Group>
                  <WidgetEventSearchPicker
                    label="Specific league events"
                    description="Search this organization's league events. Selected events page left and right in the order added."
                    organizationId={organization.$id}
                    eventTypes={STANDINGS_EVENT_TYPE_OPTIONS}
                    selectedEvents={standingsSelectedEvents}
                    onChange={setStandingsSelectedEvents}
                  />
                </Stack>
              </Paper>
            ) : null}

            {visibleWidgetSections.includes('brackets') ? (
              <Paper withBorder p="sm" radius="md" style={SECTION_WIDTH_STYLES.selection}>
                <Stack gap="sm">
                  <Title order={6}>Bracket settings</Title>
                  <Group align="flex-end" gap="sm" wrap="wrap">
                    <Select
                      label="Default event set"
                      data={WIDGET_EVENT_SELECTION_DATE_RULE_OPTIONS}
                      value={bracketsDateRule}
                      onChange={(value) => setBracketsDateRule((value as WidgetEventSelectionDateRule | null) ?? 'upcoming')}
                      style={EVENT_CONTROL_WIDTH_STYLES.datePreset}
                    />
                    <Checkbox
                      checked={bracketsShowDateFilter}
                      onChange={(event) => setBracketsShowDateFilter(event.currentTarget.checked)}
                      label="Show date filter"
                    />
                  </Group>
                  <WidgetEventSearchPicker
                    label="Specific bracket events"
                    description="Search this organization's leagues and tournaments. Selected events page left and right in the order added."
                    organizationId={organization.$id}
                    eventTypes={BRACKETS_EVENT_TYPE_OPTIONS}
                    selectedEvents={bracketsSelectedEvents}
                    onChange={setBracketsSelectedEvents}
                  />
                </Stack>
              </Paper>
            ) : null}
          </Group>
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
            <Stack gap="xs">
              <Textarea label="Iframe snippet" value={iframeSnippet} readOnly autosize minRows={4} />
              <Button variant="default" onClick={() => copySnippet(iframeSnippet, 'Iframe snippet')} disabled={!iframeSnippet || !widgetsReady}>
                Copy iframe snippet
              </Button>
            </Stack>
            <Stack gap="xs">
              <Textarea label="Script snippet" value={scriptSnippet} readOnly autosize minRows={4} />
              <Button variant="default" onClick={() => copySnippet(scriptSnippet, 'Script snippet')} disabled={!scriptSnippet || !widgetsReady}>
                Copy script snippet
              </Button>
            </Stack>
          </SimpleGrid>
        </Stack>
      </Paper>
    </Stack>
  );
}
