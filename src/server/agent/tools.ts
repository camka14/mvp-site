import { randomUUID } from 'crypto';
import type { Tool } from 'openai/resources/responses/responses';
import { z } from 'zod';
import { eventFormAgentContext, shouldIncludeEventFormAgentContext } from '@/lib/agent/eventFormContext';
import { prisma } from '@/lib/prisma';
import type { AgentClientAction, AgentPageContext, AgentPendingConfirmation, AgentToolChange } from '@/lib/agent/types';
import { canManageEvent } from '@/server/accessControl';
import type { AgentConversationOwner } from './conversations';
import pageLayoutDescriptions from './pageLayoutDescriptions.json';

const CONFIRMATION_TTL_MS = 10 * 60 * 1000;
const HIDDEN_EVENT_STATES = new Set(['UNPUBLISHED', 'DRAFT']);
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const PREFIXED_OBJECT_ID_PATTERN = /\b(?:user|event|match|field|team|org|organization|division|slot|registration|participant|official|confirmation|conv|local_team|dev_user|camka_upload)[_-][a-z0-9][a-z0-9_-]{5,}\b/gi;

type ToolExecutionMode = 'prepare' | 'confirm';

export type AgentToolResult = {
  result: Record<string, unknown>;
  changes?: AgentToolChange[];
  clientActions?: AgentClientAction[];
  pendingConfirmation?: AgentPendingConfirmation;
};

type ExecuteToolParams = {
  name: string;
  args: unknown;
  owner: AgentConversationOwner;
  conversationId: string;
  pageContext: AgentPageContext | null;
  origin: string;
  mode: ToolExecutionMode;
};

type PageLayoutClickable = {
  name: string;
  role: string;
  x: number;
  y: number;
  area: string;
};

type PageLayoutDescription = {
  key: string;
  name: string;
  pathPatterns: string[];
  summary: string;
  clickables: PageLayoutClickable[];
};

type PageLayoutData = {
  version: number;
  observedAt: string;
  source: string;
  coordinateSystem: string;
  pages: PageLayoutDescription[];
};

const pageLayouts = pageLayoutDescriptions as PageLayoutData;

const emptyObjectSchema = {
  type: 'object',
  properties: {},
  required: [],
  additionalProperties: false,
};

const readTools: Tool[] = [
  {
    type: 'function',
    name: 'get_site_navigation_help',
    description: 'Get navigation help for BracketIQ routes and common web workflows.',
    strict: false,
    parameters: {
      type: 'object',
      properties: {
        topic: { type: ['string', 'null'], description: 'The navigation topic or task the user is asking about.' },
        currentPath: { type: ['string', 'null'], description: 'The current page path if known.' },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'build_site_link',
    description: 'Build a same-origin BracketIQ link for a known app destination. Use this before showing navigation links to the user.',
    strict: false,
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The user-facing link text.' },
        path: { type: 'string', description: 'A same-site path such as /discover. Do not pass full external URLs.' },
      },
      required: ['text', 'path'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'get_page_layout_description',
    description: 'Fetch a Playwright-observed page layout description and clickable-control grid for a BracketIQ page. Use coordinates only to infer relative positions; never mention coordinate values to the user.',
    strict: false,
    parameters: {
      type: 'object',
      properties: {
        pageKey: { type: ['string', 'null'], description: 'Optional known page key, such as discover or event_schedule.' },
        pathname: { type: ['string', 'null'], description: 'Optional current pathname. If omitted, the current page context pathname is used.' },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'get_event_form_context',
    description: 'Look up detailed EventForm capability and field context for the current event Details tab, including available controls, defaults, validation, visibility, and create/update payload behavior. For broad workflow/capability questions, call with no args first or use only query; avoid section until you know where the relevant controls live. Prefer targeted section, field, or query lookups instead of includeAll.',
    strict: false,
    parameters: {
      type: 'object',
      properties: {
        section: { type: ['string', 'null'], description: 'Optional section title or id, such as Event Details, Schedule Config, or basic-information. Do not use this for broad capability questions unless the user named that section.' },
        field: { type: ['string', 'null'], description: 'Optional form field label or internal path, such as Weekly Timeslots, leagueSlots, price, or maxParticipants.' },
        query: { type: ['string', 'null'], description: 'Optional natural-language search query for the field or behavior the user asked about.' },
        includeAll: { type: ['boolean', 'null'], description: 'Return the full context JSON only when the user explicitly asks for the full/raw field map.' },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'get_event_schedule_context',
    description: 'Read sanitized schedule context for the current event, including matches, fields, participants, officials, divisions, and viewer permissions.',
    strict: false,
    parameters: {
      type: 'object',
      properties: {
        eventId: { type: ['string', 'null'], description: 'Event ID. Use the current schedule page event ID when available.' },
      },
      required: [],
      additionalProperties: false,
    },
  },
];

const matchUpdateToolProperties = {
  start: { type: ['string', 'null'], description: 'ISO date-time start, or null.' },
  end: { type: ['string', 'null'], description: 'ISO date-time end, or null.' },
  fieldId: { type: ['string', 'null'] },
  team1Id: { type: ['string', 'null'] },
  team2Id: { type: ['string', 'null'] },
  officialId: { type: ['string', 'null'] },
  officialIds: { type: ['array', 'null'], items: { type: 'object' } },
  teamOfficialId: { type: ['string', 'null'] },
  locked: { type: ['boolean', 'null'] },
  officialCheckedIn: { type: ['boolean', 'null'] },
  matchId: { type: ['number', 'null'] },
  division: { type: ['string', 'null'] },
  losersBracket: { type: ['boolean', 'null'] },
};

const draftActionTools: Tool[] = [
  {
    type: 'function',
    name: 'stage_event_match_draft_update',
    description: 'Stage a client-side draft update to one event match. This does not update the database; the user reviews the draft on the page and saves or discards it.',
    strict: false,
    parameters: {
      type: 'object',
      properties: {
        eventId: { type: 'string' },
        matchId: { type: 'string' },
        updates: {
          type: 'object',
          properties: matchUpdateToolProperties,
          additionalProperties: false,
        },
      },
      required: ['eventId', 'matchId', 'updates'],
      additionalProperties: false,
    },
  },
];

export const buildAgentTools = (owner: AgentConversationOwner): Tool[] => (
  owner.type === 'user' ? [...readTools, ...draftActionTools] : readTools
);

const navigationHelp = {
  layout: {
    primaryNavigation: 'Signed-in users use the top navigation bar. The AI assistant button sits beside Logout.',
    publicNavigation: 'Public pages use their visible header links and calls to action.',
  },
  primaryRoutes: [
    { label: 'Discover', path: '/discover', use: 'Find public events, leagues, tournaments, and pickup opportunities.' },
    { label: 'My Schedule', path: '/my-schedule', use: 'See events and matches tied to your schedule.' },
    { label: 'My Organizations', path: '/organizations', use: 'Manage facilities, clubs, organization pages, fields, staff, and hosted events.' },
    { label: 'Profile', path: '/profile', use: 'Update profile details and participant information.' },
  ],
  secondaryRoutes: [
    { label: 'Teams', path: '/teams', use: 'View and manage teams you belong to. This is available from team-related profile and organization workflows, not the top navigation bar.' },
  ],
  schedulePageTips: [
    'Open an event, then use Manage/Edit mode to change event details, participants, schedule, standings, and match results.',
    'On the Schedule tab, match changes can be made manually or staged by the assistant as draft edits.',
    'Assistant schedule edits are added to the page as unsaved changes. Use Save Changes to persist them or Discard Changes to revert them.',
  ],
};

const normalizeString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeNullableString = (value: unknown): string | null | undefined => (
  value === null ? null : normalizeString(value) ?? undefined
);

const currentEventIdFromContext = (pageContext: AgentPageContext | null): string | null => (
  normalizeString(pageContext?.page?.eventId)
);

const hasUnsavedScheduleChanges = (pageContext: AgentPageContext | null): boolean => (
  pageContext?.page?.kind === 'event_schedule' && pageContext.page.hasUnsavedChanges === true
);

const formatUserName = (user: { firstName?: string | null; lastName?: string | null; userName?: string | null; id?: string }): string => {
  const fullName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
  return fullName || user.userName?.trim() || 'Unknown user';
};

const parseToolArgs = (args: unknown): Record<string, unknown> => {
  if (!args) return {};
  if (typeof args === 'string') {
    try {
      const parsed = JSON.parse(args);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
  return args && typeof args === 'object' && !Array.isArray(args) ? args as Record<string, unknown> : {};
};

const normalizePathname = (value: unknown): string | null => {
  const raw = normalizeString(value);
  if (!raw) return null;
  try {
    const pathname = new URL(raw, 'https://bracket-iq.local').pathname;
    return pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  } catch {
    return raw.startsWith('/') ? raw.replace(/\/+$/, '') || '/' : `/${raw.replace(/\/+$/, '')}`;
  }
};

const pathPatternMatches = (pattern: string, pathname: string): boolean => {
  const patternSegments = pattern.split('/').filter(Boolean);
  const pathSegments = pathname.split('/').filter(Boolean);
  if (patternSegments.length !== pathSegments.length) return false;
  return patternSegments.every((segment, index) => (
    /^\[[^\]]+\]$/.test(segment) || segment === pathSegments[index]
  ));
};

const findPageLayout = (params: { pageKey?: string | null; pathname?: string | null }): PageLayoutDescription | null => {
  const pageKey = normalizeString(params.pageKey)?.toLowerCase();
  if (pageKey) {
    const byKey = pageLayouts.pages.find((page) => page.key.toLowerCase() === pageKey);
    if (byKey) return byKey;
  }

  const pathname = normalizePathname(params.pathname);
  if (!pathname) return null;
  return pageLayouts.pages.find((page) => page.pathPatterns.some((pattern) => pathPatternMatches(pattern, pathname))) ?? null;
};

const getPageLayoutDescription = (args: Record<string, unknown>, pageContext: AgentPageContext | null): Record<string, unknown> => {
  const layout = findPageLayout({
    pageKey: normalizeString(args.pageKey),
    pathname: normalizePathname(args.pathname) ?? pageContext?.pathname ?? null,
  });
  if (!layout) {
    return {
      status: 'not_found',
      error: 'No page layout description is available for this page yet.',
      availablePages: pageLayouts.pages.map((page) => ({ key: page.key, name: page.name })),
    };
  }

  const clickableGrid = layout.clickables.map((clickable) => ({
    name: clickable.name,
    role: clickable.role,
    x: clickable.x,
    y: clickable.y,
    area: clickable.area,
  }));
  return {
    status: 'ok',
    version: pageLayouts.version,
    observedAt: pageLayouts.observedAt,
    source: pageLayouts.source,
    coordinateUse: 'Use x/y only to infer relative screen position. Do not mention coordinates to the user.',
    page: {
      key: layout.key,
      name: layout.name,
      summary: layout.summary,
      pathPatterns: layout.pathPatterns,
    },
    clickableGrid,
    clickableGridJson: JSON.stringify(clickableGrid),
  };
};

type EventFormSection = typeof eventFormAgentContext.sections[number];
type EventFormInput = EventFormSection['inputs'][number];
type EventFormCapability = typeof eventFormAgentContext.capabilities[number];

const EVENT_FORM_LOOKUP_STOP_WORDS = new Set([
  'about',
  'available',
  'capability',
  'capabilities',
  'create',
  'creating',
  'does',
  'event',
  'field',
  'fields',
  'form',
  'have',
  'how',
  'mean',
  'option',
  'options',
  'setup',
  'that',
  'there',
  'this',
  'toggle',
  'using',
  'versus',
  'vs',
  'what',
  'when',
  'where',
  'which',
  'with',
]);

const compactLookupText = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, '');

const lookupTokens = (value: string): string[] => (
  value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !EVENT_FORM_LOOKUP_STOP_WORDS.has(token))
);

const matchesLookup = (haystack: string, lookup: string | null): boolean => {
  return lookupScore(haystack, lookup) > 0;
};

const lookupScore = (haystack: string, lookup: string | null): number => {
  if (!lookup) return 0;
  const normalizedHaystack = haystack.toLowerCase();
  const normalizedLookup = lookup.toLowerCase();
  let score = normalizedHaystack.includes(normalizedLookup) ? 20 : 0;

  const compactHaystack = compactLookupText(normalizedHaystack);
  const compactNeedle = compactLookupText(normalizedLookup);
  if (compactNeedle && compactHaystack.includes(compactNeedle)) score += 18;

  const tokens = lookupTokens(normalizedLookup);
  tokens.forEach((token) => {
    if (normalizedHaystack.includes(token)) {
      score += token.length >= 6 ? 4 : 2;
      return;
    }
    if (compactHaystack.includes(compactLookupText(token))) {
      score += 1;
    }
  });
  return score;
};

const sectionSearchText = (section: EventFormSection): string => [
  section.id,
  section.title,
  section.visibleWhen,
  section.summary,
].join(' ');

const inputSearchText = (input: EventFormInput): string => [
  input.path,
  input.label,
  input.inputType,
  input.visibleWhen,
  input.requiredWhen,
  input.defaultOrPreset,
  input.description,
  ...input.createsOrUpdates,
].join(' ');

const capabilitySearchText = (capability: EventFormCapability): string => [
  capability.id,
  capability.title,
  capability.appliesWhen,
  capability.description,
  ...capability.composedFrom,
  ...capability.setupSteps,
  ...capability.cautions,
].join(' ');

const summarizeEventFormCapability = (capability: EventFormCapability): Record<string, unknown> => ({
  id: capability.id,
  title: capability.title,
  appliesWhen: capability.appliesWhen,
  composedFrom: capability.composedFrom,
  description: capability.description,
});

const summarizeEventFormInput = (input: EventFormInput): Record<string, unknown> => ({
  path: input.path,
  label: input.label,
  inputType: input.inputType,
  visibleWhen: input.visibleWhen,
  requiredWhen: input.requiredWhen,
});

const summarizeEventFormSection = (section: EventFormSection): Record<string, unknown> => ({
  id: section.id,
  title: section.title,
  visibleWhen: section.visibleWhen,
  summary: section.summary,
  inputCount: section.inputs.length,
  inputs: section.inputs.map(summarizeEventFormInput),
});

const eventFormFieldIndex = (): Record<string, unknown>[] => (
  eventFormAgentContext.sections.map((section) => ({
    id: section.id,
    title: section.title,
    summary: section.summary,
    inputs: section.inputs.map((input) => ({
      path: input.path,
      label: input.label,
      inputType: input.inputType,
    })),
  }))
);

const findSuggestedEventFormCapabilities = (
  lookup: string | null,
  limit = 5,
): Record<string, unknown>[] => {
  if (!lookup) return [];

  return eventFormAgentContext.capabilities
    .map((capability) => ({
      score: lookupScore(capabilitySearchText(capability), lookup),
      ...capability,
    }))
    .filter((match) => match.score > 0)
    .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title))
    .slice(0, limit)
    .map(({ score: _score, ...capability }) => capability);
};

const findSuggestedEventFormInputs = (
  lookup: string | null,
  limit = 8,
): Record<string, unknown>[] => {
  if (!lookup) return [];

  return eventFormAgentContext.sections
    .flatMap((section) => (
      section.inputs.map((input) => ({
        score: lookupScore(`${sectionSearchText(section)} ${inputSearchText(input)}`, lookup),
        sectionId: section.id,
        sectionTitle: section.title,
        path: input.path,
        label: input.label,
        inputType: input.inputType,
        visibleWhen: input.visibleWhen,
        requiredWhen: input.requiredWhen,
        description: input.description,
      }))
    ))
    .filter((match) => match.score > 0)
    .sort((left, right) => right.score - left.score || left.sectionTitle.localeCompare(right.sectionTitle))
    .slice(0, limit)
    .map(({ score: _score, ...match }) => match);
};

const getEventFormContext = (args: Record<string, unknown>, pageContext: AgentPageContext | null): Record<string, unknown> => {
  if (!shouldIncludeEventFormAgentContext(pageContext)) {
    return {
      status: 'not_applicable',
      error: 'Event form context is only available when the current page context is the event schedule Details tab.',
      currentPage: {
        kind: pageContext?.page?.kind ?? null,
        activeTab: pageContext?.page?.activeTab ?? null,
      },
    };
  }

  if (args.includeAll === true) {
    return {
      status: 'ok',
      mode: 'full',
      context: eventFormAgentContext,
    };
  }

  const sectionLookup = normalizeString(args.section);
  const fieldLookup = normalizeString(args.field);
  const queryLookup = normalizeString(args.query);
  const hasFilter = Boolean(sectionLookup || fieldLookup || queryLookup);

  if (!hasFilter) {
    return {
      status: 'ok',
      mode: 'overview',
      purpose: eventFormAgentContext.purpose,
      answerGuidance: eventFormAgentContext.answerGuidance,
      lookupHint: 'For broad workflow/capability questions, inspect capabilities and field inventory first, then call this tool again with only query or with a known field/section. Use includeAll only if the user asks for the raw/full map.',
      capabilities: eventFormAgentContext.capabilities.map(summarizeEventFormCapability),
      defaultsAndPresets: eventFormAgentContext.defaultsAndPresets,
      validationRules: eventFormAgentContext.validationRules,
      sections: eventFormAgentContext.sections.map(summarizeEventFormSection),
    };
  }

  const matchedDefaultsAndPresets = queryLookup
    ? eventFormAgentContext.defaultsAndPresets.filter((item) => matchesLookup(item, queryLookup))
    : [];
  const matchedValidationRules = queryLookup
    ? eventFormAgentContext.validationRules.filter((item) => matchesLookup(item, queryLookup))
    : [];
  const suggestionLookup = fieldLookup ?? queryLookup ?? sectionLookup ?? null;
  const matchedCapabilities = findSuggestedEventFormCapabilities(suggestionLookup);
  const suggestedMatches = findSuggestedEventFormInputs(suggestionLookup);

  const sections = eventFormAgentContext.sections
    .map((section) => {
      const sectionMatchesSection = sectionLookup ? matchesLookup(sectionSearchText(section), sectionLookup) : true;
      const sectionMatchesQuery = queryLookup ? matchesLookup(sectionSearchText(section), queryLookup) : false;
      if (!sectionMatchesSection) return null;

      const inputs = section.inputs.filter((input) => {
        const inputText = inputSearchText(input);
        const fieldMatches = fieldLookup ? matchesLookup(inputText, fieldLookup) : true;
        const queryMatches = queryLookup ? (sectionMatchesQuery || matchesLookup(inputText, queryLookup)) : true;
        return fieldMatches && queryMatches;
      });

      if (inputs.length === 0 && !(sectionMatchesQuery && !fieldLookup)) return null;

      return {
        id: section.id,
        title: section.title,
        visibleWhen: section.visibleWhen,
        summary: section.summary,
        inputs: inputs.length > 0 ? inputs : section.inputs,
      };
    })
    .filter((section): section is NonNullable<typeof section> => Boolean(section));
  const noMatches = sections.length === 0
    && matchedCapabilities.length === 0
    && matchedDefaultsAndPresets.length === 0
    && matchedValidationRules.length === 0;

  return {
    status: 'ok',
    mode: 'filtered',
    lookupGuidance: 'If this does not answer the workflow question, call get_event_form_context again without section or field filters. Prefer matchedCapabilities for broad workflow answers because capabilities can span multiple EventForm sections.',
    query: {
      section: sectionLookup ?? null,
      field: fieldLookup ?? null,
      query: queryLookup ?? null,
    },
    matchedCapabilities,
    matchedDefaultsAndPresets,
    matchedValidationRules,
    sections,
    suggestedMatches,
    availableSections: noMatches ? eventFormFieldIndex() : undefined,
    noMatches,
  };
};

export const buildSameOriginLink = (origin: string, path: string): string => {
  const trimmed = path.trim();
  if (!trimmed || /^[a-z][a-z0-9+.-]*:/i.test(trimmed) || trimmed.startsWith('//')) {
    throw new Error('Only same-site paths are supported.');
  }
  if (containsObjectId(trimmed)) {
    throw new Error('Object-specific paths cannot be shown in chat.');
  }
  const normalizedPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  const url = new URL(normalizedPath, origin);
  const expectedOrigin = new URL(origin).origin;
  if (url.origin !== expectedOrigin) {
    throw new Error('Only same-origin BracketIQ links are supported.');
  }
  return url.toString();
};

export const containsObjectId = (value: string): boolean => {
  UUID_PATTERN.lastIndex = 0;
  PREFIXED_OBJECT_ID_PATTERN.lastIndex = 0;
  return UUID_PATTERN.test(value) || PREFIXED_OBJECT_ID_PATTERN.test(value);
};

export const redactUserFacingObjectIds = (value: string): string => {
  UUID_PATTERN.lastIndex = 0;
  PREFIXED_OBJECT_ID_PATTERN.lastIndex = 0;
  return value
    .replace(new RegExp(`\\bmatch\\s+${UUID_PATTERN.source}`, 'gi'), 'the selected match')
    .replace(new RegExp(`\\bmatch\\s+${PREFIXED_OBJECT_ID_PATTERN.source}`, 'gi'), 'the selected match')
    .replace(new RegExp(`\\bevent\\s+${UUID_PATTERN.source}`, 'gi'), 'the selected event')
    .replace(new RegExp(`\\bevent\\s+${PREFIXED_OBJECT_ID_PATTERN.source}`, 'gi'), 'the selected event')
    .replace(new RegExp(`\\bteam\\s+${UUID_PATTERN.source}`, 'gi'), 'the selected team')
    .replace(new RegExp(`\\bteam\\s+${PREFIXED_OBJECT_ID_PATTERN.source}`, 'gi'), 'the selected team')
    .replace(new RegExp(`\\buser\\s+${UUID_PATTERN.source}`, 'gi'), 'the selected user')
    .replace(new RegExp(`\\buser\\s+${PREFIXED_OBJECT_ID_PATTERN.source}`, 'gi'), 'the selected user')
    .replace(UUID_PATTERN, 'the selected item')
    .replace(PREFIXED_OBJECT_ID_PATTERN, 'the selected item')
    .replace(/\s{2,}/g, ' ')
    .trim();
};

const getPendingDelegate = () => (prisma as any).aiPendingConfirmation;

export const listPendingConfirmations = async (
  conversationId: string,
  owner: AgentConversationOwner,
): Promise<AgentPendingConfirmation[]> => {
  const now = new Date();
  const where = {
    openaiConversationId: conversationId,
    status: 'PENDING',
    expiresAt: { gt: now },
    ...(owner.type === 'user' ? { userId: owner.userId } : { sessionId: owner.sessionId }),
  };
  const rows = await getPendingDelegate().findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { id: true, toolName: true, summary: true, expiresAt: true },
  });
  return rows.map((row: any) => ({
    id: row.id,
    toolName: row.toolName,
    summary: redactUserFacingObjectIds(row.summary),
    expiresAt: row.expiresAt instanceof Date ? row.expiresAt.toISOString() : new Date(row.expiresAt).toISOString(),
  }));
};

const createPendingConfirmation = async (
  params: {
    owner: AgentConversationOwner;
    conversationId: string;
    toolName: string;
    args: Record<string, unknown>;
    summary: string;
  },
): Promise<AgentPendingConfirmation> => {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CONFIRMATION_TTL_MS);
  const row = await getPendingDelegate().create({
    data: {
      id: randomUUID(),
      userId: params.owner.type === 'user' ? params.owner.userId : null,
      sessionId: params.owner.type === 'guest' ? params.owner.sessionId : null,
      openaiConversationId: params.conversationId,
      toolName: params.toolName,
      args: params.args,
      summary: redactUserFacingObjectIds(params.summary),
      status: 'PENDING',
      expiresAt,
      createdAt: now,
      updatedAt: now,
    },
    select: { id: true, toolName: true, summary: true, expiresAt: true },
  });
  return {
    id: row.id,
    toolName: row.toolName,
    summary: row.summary,
    expiresAt: row.expiresAt.toISOString(),
  };
};

const canReadEvent = async (
  owner: AgentConversationOwner,
  event: { state?: string | null; hostId: string | null; assistantHostIds?: unknown; organizationId?: string | null } | null,
): Promise<{ canManage: boolean; canRead: boolean }> => {
  if (!event) return { canManage: false, canRead: false };
  if (owner.type !== 'user') {
    return {
      canManage: false,
      canRead: !HIDDEN_EVENT_STATES.has(String(event.state ?? 'PUBLISHED').toUpperCase()),
    };
  }
  const canManage = await canManageEvent(owner.session, event);
  const canRead = canManage || !HIDDEN_EVENT_STATES.has(String(event.state ?? 'PUBLISHED').toUpperCase());
  return { canManage, canRead };
};

const getEventScheduleContext = async (
  owner: AgentConversationOwner,
  args: Record<string, unknown>,
  pageContext: AgentPageContext | null,
): Promise<Record<string, unknown>> => {
  const eventId = normalizeString(args.eventId) ?? currentEventIdFromContext(pageContext);
  if (!eventId) {
    return { error: 'eventId is required. Open an event schedule page or provide an event ID.' };
  }

  const event = await prisma.events.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      name: true,
      start: true,
      end: true,
      location: true,
      eventType: true,
      state: true,
      hostId: true,
      assistantHostIds: true,
      organizationId: true,
      fieldIds: true,
      officialSchedulingMode: true,
      teamSignup: true,
      singleDivision: true,
      divisions: true,
    },
  });
  const access = await canReadEvent(owner, event);
  if (!event || !access.canRead) {
    return { error: 'Event not found or you do not have access to read it.' };
  }

  const [fields, matches, divisions, teams, registrations, eventOfficials] = await Promise.all([
    prisma.fields.findMany({
      where: { id: { in: Array.isArray(event.fieldIds) ? event.fieldIds : [] } },
      select: { id: true, name: true, location: true },
    }),
    prisma.matches.findMany({
      where: { eventId },
      orderBy: [{ start: 'asc' }, { matchId: 'asc' }],
      select: {
        id: true,
        matchId: true,
        start: true,
        end: true,
        locked: true,
        status: true,
        resultStatus: true,
        fieldId: true,
        team1Id: true,
        team2Id: true,
        officialId: true,
        officialIds: true,
        teamOfficialId: true,
        team1Points: true,
        team2Points: true,
        setResults: true,
        division: true,
        losersBracket: true,
      },
    }),
    prisma.divisions.findMany({
      where: { eventId },
      select: { id: true, name: true, key: true, kind: true, teamIds: true },
      orderBy: { name: 'asc' },
    }),
    prisma.teams.findMany({
      where: { eventId },
      select: { id: true, name: true, division: true, divisionTypeId: true, kind: true },
      orderBy: { name: 'asc' },
    }),
    prisma.eventRegistrations.findMany({
      where: { eventId, status: { in: ['ACTIVE', 'PENDING', 'STARTED'] } },
      select: {
        id: true,
        registrantType: true,
        registrantId: true,
        eventTeamId: true,
        rosterRole: true,
        status: true,
        divisionId: true,
        slotId: true,
        occurrenceDate: true,
      },
    }),
    prisma.eventOfficials.findMany({
      where: { eventId, isActive: { not: false } },
      select: { userId: true, positionIds: true, fieldIds: true, isActive: true },
    }),
  ]);

  const userIds = Array.from(new Set([
    ...registrations
      .filter((registration) => registration.registrantType !== 'TEAM')
      .map((registration) => registration.registrantId),
    ...eventOfficials.map((official) => official.userId),
    ...matches.map((match) => match.officialId).filter((value): value is string => Boolean(value)),
  ]));
  const users = userIds.length
    ? await prisma.userData.findMany({
      where: { id: { in: userIds } },
      select: { id: true, firstName: true, lastName: true, userName: true },
    })
    : [];
  const userNameById = new Map(users.map((user) => [user.id, formatUserName(user)]));
  const teamNameById = new Map(teams.map((team) => [team.id, team.name]));
  const fieldNameById = new Map(fields.map((field) => [field.id, field.name ?? field.id]));

  return {
    event: {
      id: event.id,
      name: event.name,
      eventType: event.eventType,
      state: event.state,
      start: event.start?.toISOString(),
      end: event.end?.toISOString() ?? null,
      location: event.location,
      teamSignup: event.teamSignup,
      singleDivision: event.singleDivision,
      officialSchedulingMode: event.officialSchedulingMode,
    },
    viewer: {
      authenticated: owner.type === 'user',
      canManageEvent: access.canManage,
      canStageDraftActions: owner.type === 'user' && access.canManage && Boolean(pageContext?.page?.canEditMatches),
      hasUnsavedChanges: hasUnsavedScheduleChanges(pageContext),
    },
    pageDraft: {
      pendingChanges: pageContext?.page?.pendingChanges ?? null,
      draftSchedule: pageContext?.page?.draftSchedule ?? null,
    },
    fields: fields.map((field) => ({
      id: field.id,
      name: field.name,
      location: field.location,
    })),
    divisions: divisions.map((division) => ({
      id: division.id,
      name: division.name,
      key: division.key,
      kind: division.kind,
      teamIds: division.teamIds,
    })),
    teams: teams.map((team) => ({
      id: team.id,
      name: team.name,
      division: team.division,
      divisionTypeId: team.divisionTypeId,
      kind: team.kind,
    })),
    officials: eventOfficials.map((official) => ({
      userId: official.userId,
      displayName: userNameById.get(official.userId) ?? official.userId,
      positionIds: official.positionIds,
      fieldIds: official.fieldIds,
    })),
    participants: registrations.map((registration) => ({
      id: registration.id,
      type: registration.registrantType,
      registrantId: registration.registrantId,
      displayName: registration.registrantType === 'TEAM'
        ? teamNameById.get(registration.eventTeamId ?? registration.registrantId) ?? 'Unknown team'
        : userNameById.get(registration.registrantId) ?? 'Unknown participant',
      eventTeamId: registration.eventTeamId,
      rosterRole: registration.rosterRole,
      status: registration.status,
      divisionId: registration.divisionId,
      slotId: registration.slotId,
      occurrenceDate: registration.occurrenceDate,
    })),
    matches: matches.map((match) => ({
      id: match.id,
      matchId: match.matchId,
      start: match.start?.toISOString() ?? null,
      end: match.end?.toISOString() ?? null,
      locked: match.locked,
      status: match.status,
      resultStatus: match.resultStatus,
      fieldId: match.fieldId,
      fieldName: match.fieldId ? fieldNameById.get(match.fieldId) ?? 'Unknown field' : null,
      team1Id: match.team1Id,
      team1Name: match.team1Id ? teamNameById.get(match.team1Id) ?? 'Unknown team' : null,
      team2Id: match.team2Id,
      team2Name: match.team2Id ? teamNameById.get(match.team2Id) ?? 'Unknown team' : null,
      officialId: match.officialId,
      officialName: match.officialId ? userNameById.get(match.officialId) ?? 'Unknown official' : null,
      officialIds: match.officialIds,
      teamOfficialId: match.teamOfficialId,
      teamOfficialName: match.teamOfficialId ? teamNameById.get(match.teamOfficialId) ?? 'Unknown team' : null,
      team1Points: match.team1Points,
      team2Points: match.team2Points,
      setResults: match.setResults,
      division: match.division,
      losersBracket: match.losersBracket,
    })),
  };
};

const matchUpdateFieldsSchema = z.object({
  start: z.string().nullable().optional(),
  end: z.string().nullable().optional(),
  fieldId: z.string().nullable().optional(),
  team1Id: z.string().nullable().optional(),
  team2Id: z.string().nullable().optional(),
  officialId: z.string().nullable().optional(),
  officialIds: z.array(z.record(z.string(), z.unknown())).nullable().optional(),
  teamOfficialId: z.string().nullable().optional(),
  locked: z.boolean().nullable().optional(),
  officialCheckedIn: z.boolean().nullable().optional(),
  matchId: z.number().int().nullable().optional(),
  division: z.string().nullable().optional(),
  losersBracket: z.boolean().nullable().optional(),
}).strict();

const updateMatchSchema = z.object({
  eventId: z.string().min(1),
  matchId: z.string().min(1),
  updates: matchUpdateFieldsSchema,
}).strict();

const updateScoreSchema = z.object({
  eventId: z.string().min(1),
  matchId: z.string().min(1),
  team1Points: z.array(z.number()).nullable().optional(),
  team2Points: z.array(z.number()).nullable().optional(),
  setResults: z.array(z.number()).nullable().optional(),
  segmentOperations: z.array(z.record(z.string(), z.unknown())).nullable().optional(),
}).strict();

const participantSchema = z.object({
  eventId: z.string().min(1),
  mode: z.enum(['add', 'remove']),
  targetType: z.enum(['user', 'team']),
  userId: z.string().nullable().optional(),
  teamId: z.string().nullable().optional(),
  divisionId: z.string().nullable().optional(),
  divisionTypeId: z.string().nullable().optional(),
  divisionTypeKey: z.string().nullable().optional(),
  slotId: z.string().nullable().optional(),
  occurrenceDate: z.string().nullable().optional(),
}).strict().superRefine((value, ctx) => {
  const hasUser = Boolean(normalizeString(value.userId));
  const hasTeam = Boolean(normalizeString(value.teamId));
  if (value.targetType === 'user' && !hasUser) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'userId is required for user participant changes.', path: ['userId'] });
  }
  if (value.targetType === 'team' && !hasTeam) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'teamId is required for team participant changes.', path: ['teamId'] });
  }
  if (hasUser && hasTeam) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Specify only userId or teamId, not both.', path: ['targetType'] });
  }
});

const regenerateScheduleSchema = z.object({
  eventId: z.string().min(1),
  participantCount: z.number().int().positive().nullable().optional(),
}).strict();

const sanitizeMatchUpdates = (updates: z.infer<typeof matchUpdateFieldsSchema>): Record<string, unknown> => (
  Object.fromEntries(
    Object.entries(updates).filter(([, value]) => value !== undefined && value !== null),
  )
);

const sanitizeArgsForTool = (name: string, args: Record<string, unknown>): Record<string, unknown> => {
  switch (name) {
    case 'stage_event_match_draft_update':
    case 'update_event_match': {
      const parsed = updateMatchSchema.parse(args);
      const updates = sanitizeMatchUpdates(parsed.updates);
      return { eventId: parsed.eventId, matchId: parsed.matchId, updates };
    }
    case 'update_match_score': {
      const parsed = updateScoreSchema.parse(args);
      return Object.fromEntries(Object.entries(parsed).filter(([, value]) => value !== undefined && value !== null));
    }
    case 'update_event_participant': {
      const parsed = participantSchema.parse(args);
      return Object.fromEntries(Object.entries(parsed).filter(([, value]) => value !== undefined && value !== null));
    }
    case 'regenerate_event_schedule': {
      const parsed = regenerateScheduleSchema.parse(args);
      return Object.fromEntries(Object.entries(parsed).filter(([, value]) => value !== undefined && value !== null));
    }
    default:
      return args;
  }
};

const updateFieldLabels: Record<string, string> = {
  start: 'start time',
  end: 'end time',
  fieldId: 'field',
  team1Id: 'team 1',
  team2Id: 'team 2',
  officialId: 'official',
  officialIds: 'officials',
  teamOfficialId: 'team official',
  locked: 'lock state',
  officialCheckedIn: 'official check-in',
  matchId: 'displayed match number',
  division: 'division',
  losersBracket: 'bracket side',
};

const buildBulkMatchUpdatePayload = (matchId: string, updates: Record<string, unknown>): Record<string, unknown> => ({
  id: matchId,
  ...updates,
});

const formatUpdateFieldNames = (updates: unknown): string => {
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    return 'none';
  }
  const labels = Object.keys(updates as Record<string, unknown>)
    .map((key) => updateFieldLabels[key] ?? key.replace(/Id$/, '').replace(/([A-Z])/g, ' $1').toLowerCase())
    .filter(Boolean);
  return labels.length > 0 ? labels.join(', ') : 'none';
};

const describeMatchForUser = async (eventId: string | null, matchId: string | null): Promise<string> => {
  if (!eventId || !matchId) return 'the selected match';
  const match = await prisma.matches.findUnique({
    where: { id: matchId },
    select: { matchId: true, team1Id: true, team2Id: true },
  }).catch(() => null);
  if (!match) return 'the selected match';

  const labelParts: string[] = [];
  if (typeof match.matchId === 'number') {
    labelParts.push(`match #${match.matchId}`);
  }

  const teamIds = [match.team1Id, match.team2Id].filter((value): value is string => Boolean(value));
  if (teamIds.length > 0) {
    const teams = await prisma.teams.findMany({
      where: { id: { in: teamIds } },
      select: { id: true, name: true },
    }).catch(() => []);
    const teamNameById = new Map(teams.map((team) => [team.id, team.name]));
    const teamNames = teamIds.map((id) => teamNameById.get(id)).filter((value): value is string => Boolean(value));
    if (teamNames.length === 2) {
      labelParts.push(`${teamNames[0]} vs ${teamNames[1]}`);
    } else if (teamNames.length === 1) {
      labelParts.push(teamNames[0]);
    }
  }

  return labelParts.length > 0 ? labelParts.join(' - ') : 'the selected match';
};

const describeParticipantForUser = async (args: Record<string, unknown>): Promise<string> => {
  const teamId = normalizeString(args.teamId);
  const userId = normalizeString(args.userId);

  if (teamId) {
    const team = await prisma.teams.findUnique({
      where: { id: teamId },
      select: { name: true },
    }).catch(() => null);
    return team?.name ? `team "${team.name}"` : 'the selected team';
  }

  if (userId) {
    const user = await prisma.userData.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true, userName: true },
    }).catch(() => null);
    return user ? `participant "${formatUserName(user)}"` : 'the selected participant';
  }

  return 'the selected participant';
};

const summarizeWriteTool = async (toolName: string, args: Record<string, unknown>): Promise<string> => {
  const eventId = normalizeString(args.eventId);
  const event = eventId
    ? await prisma.events.findUnique({ where: { id: eventId }, select: { name: true } })
    : null;
  const eventLabel = event?.name ? `"${event.name}"` : 'this event';

  switch (toolName) {
    case 'stage_event_match_draft_update':
    case 'update_event_match': {
      const matchLabel = await describeMatchForUser(eventId, normalizeString(args.matchId));
      return redactUserFacingObjectIds(`Update ${matchLabel} for ${eventLabel}. Fields: ${formatUpdateFieldNames(args.updates)}.`);
    }
    case 'update_match_score': {
      const matchLabel = await describeMatchForUser(eventId, normalizeString(args.matchId));
      return redactUserFacingObjectIds(`Update score/results for ${matchLabel} in ${eventLabel}.`);
    }
    case 'update_event_participant': {
      const target = await describeParticipantForUser(args);
      return redactUserFacingObjectIds(`${args.mode === 'remove' ? 'Remove' : 'Add'} ${target} ${args.mode === 'remove' ? 'from' : 'to'} ${eventLabel}.`);
    }
    case 'regenerate_event_schedule':
      return `Regenerate or refresh the saved schedule for ${eventLabel}.`;
    default:
      return `Run ${toolName} for ${eventLabel}.`;
  }
};

const createClientDraftActionResult = async (
  params: ExecuteToolParams,
  args: Record<string, unknown>,
): Promise<AgentToolResult> => {
  if (params.owner.type !== 'user') {
    return { result: { status: 'unauthorized', error: 'Sign in is required for this action.' } };
  }

  const pageEventId = currentEventIdFromContext(params.pageContext);
  const eventId = normalizeString(args.eventId);
  if (!eventId || !pageEventId || eventId !== pageEventId || params.pageContext?.page?.kind !== 'event_schedule') {
    return {
      result: {
        status: 'failed',
        error: 'Open the event schedule page before asking the assistant to stage schedule edits.',
      },
    };
  }

  if (!params.pageContext?.page?.canEditMatches) {
    return {
      result: {
        status: 'failed',
        error: 'Open Manage/Edit mode before asking the assistant to stage match edits.',
      },
    };
  }

  const event = await prisma.events.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      name: true,
      state: true,
      hostId: true,
      assistantHostIds: true,
      organizationId: true,
    },
  });
  const access = await canReadEvent(params.owner, event);
  if (!event || !access.canManage) {
    return {
      result: {
        status: 'unauthorized',
        error: 'You do not have permission to edit this event schedule.',
      },
    };
  }

  const summary = await summarizeWriteTool(params.name, args);
  const action: AgentClientAction = {
    type: 'schedule.match.update',
    eventId,
    matchId: String(args.matchId),
    updates: args.updates as AgentClientAction['updates'],
    summary,
  };

  return {
    result: {
      status: 'client_action',
      summary,
      actionType: action.type,
      instructions: 'The draft update will be applied in the browser. The user must save changes to persist it.',
    },
    clientActions: [action],
  };
};

const createConfirmationRequiredResult = async (
  params: ExecuteToolParams,
  args: Record<string, unknown>,
): Promise<AgentToolResult> => {
  if (params.owner.type !== 'user') {
    return { result: { status: 'unauthorized', error: 'Sign in is required for this action.' } };
  }
  if (hasUnsavedScheduleChanges(params.pageContext)) {
    return {
      result: {
        status: 'save_required',
        error: 'The schedule page has unsaved changes. Save those changes before asking the assistant to run schedule actions.',
      },
    };
  }
  const summary = await summarizeWriteTool(params.name, args);
  const pendingConfirmation = await createPendingConfirmation({
    owner: params.owner,
    conversationId: params.conversationId,
    toolName: params.name,
    args,
    summary,
  });
  return {
    result: {
      status: 'confirmation_required',
      confirmationId: pendingConfirmation.id,
      summary: pendingConfirmation.summary,
      expiresAt: pendingConfirmation.expiresAt,
    },
    pendingConfirmation,
  };
};

const fetchJsonOrToolError = async (url: string, init: RequestInit): Promise<{ ok: boolean; status: number; body: any }> => {
  const response = await fetch(url, {
    ...init,
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  let body: any = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { error: text };
    }
  }
  return { ok: response.ok, status: response.status, body };
};

const authHeaders = (owner: AgentConversationOwner): HeadersInit => {
  if (owner.type !== 'user') return {};
  return { Authorization: `Bearer ${owner.session.rawToken}` };
};

const summarizeExecutedMatchUpdates = async (
  eventId: string,
  matches: Array<{ matchId: string; updates: Record<string, unknown> }>,
): Promise<string> => {
  if (matches.length === 1) {
    const matchLabel = await describeMatchForUser(eventId, matches[0].matchId);
    return redactUserFacingObjectIds(`Updated ${matchLabel}.`);
  }

  const labels = await Promise.all(matches.slice(0, 5).map((entry) => describeMatchForUser(eventId, entry.matchId)));
  const moreCount = matches.length - labels.length;
  const suffix = moreCount > 0 ? `, plus ${moreCount} more` : '';
  return redactUserFacingObjectIds(`Updated ${matches.length} matches: ${labels.join(', ')}${suffix}.`);
};

const executeBulkMatchUpdateTool = async (
  params: ExecuteToolParams,
  eventId: string,
  matches: Array<{ matchId: string; updates: Record<string, unknown> }>,
): Promise<AgentToolResult> => {
  const response = await fetchJsonOrToolError(
    `${params.origin}/api/events/${encodeURIComponent(eventId)}/matches`,
    {
      method: 'PATCH',
      headers: authHeaders(params.owner),
      body: JSON.stringify({
        matches: matches.map((entry) => buildBulkMatchUpdatePayload(entry.matchId, entry.updates)),
      }),
    },
  );
  if (!response.ok) {
    return { result: { status: 'failed', httpStatus: response.status, error: redactUserFacingObjectIds(String(response.body?.error ?? 'Match update failed.')) } };
  }

  return {
    result: {
      status: 'executed',
      summary: await summarizeExecutedMatchUpdates(eventId, matches),
    },
    changes: matches.map((entry) => ({
      type: 'match',
      id: entry.matchId,
      eventId,
      operation: 'update',
      label: 'Match updated',
    })),
  };
};

const executeWriteTool = async (
  params: ExecuteToolParams,
  args: Record<string, unknown>,
): Promise<AgentToolResult> => {
  if (params.owner.type !== 'user') {
    return { result: { status: 'unauthorized', error: 'Sign in is required for this action.' } };
  }
  if (hasUnsavedScheduleChanges(params.pageContext)) {
    return {
      result: {
        status: 'save_required',
        error: 'The schedule page has unsaved changes. Save those changes first, then retry this action.',
      },
    };
  }

  if (params.name === 'update_event_match') {
    const parsed = updateMatchSchema.parse(args);
    return executeBulkMatchUpdateTool(
      params,
      parsed.eventId,
      [{ matchId: parsed.matchId, updates: parsed.updates }],
    );
  }

  if (params.name === 'update_match_score') {
    const parsed = updateScoreSchema.parse(args);
    const matchLabel = await describeMatchForUser(parsed.eventId, parsed.matchId);
    const body = {
      ...(Array.isArray(parsed.team1Points) ? { team1Points: parsed.team1Points } : {}),
      ...(Array.isArray(parsed.team2Points) ? { team2Points: parsed.team2Points } : {}),
      ...(Array.isArray(parsed.setResults) ? { setResults: parsed.setResults } : {}),
      ...(Array.isArray(parsed.segmentOperations) ? { segmentOperations: parsed.segmentOperations } : {}),
    };
    const response = await fetchJsonOrToolError(
      `${params.origin}/api/events/${encodeURIComponent(parsed.eventId)}/matches/${encodeURIComponent(parsed.matchId)}`,
      {
        method: 'PATCH',
        headers: authHeaders(params.owner),
        body: JSON.stringify(body),
      },
    );
    if (!response.ok) {
      return { result: { status: 'failed', httpStatus: response.status, error: redactUserFacingObjectIds(String(response.body?.error ?? 'Score update failed.')) } };
    }
    return {
      result: {
        status: 'executed',
        summary: redactUserFacingObjectIds(`Updated score for ${matchLabel}.`),
      },
      changes: [{ type: 'match', id: parsed.matchId, eventId: parsed.eventId, operation: 'update', label: 'Score updated' }],
    };
  }

  if (params.name === 'update_event_participant') {
    const parsed = participantSchema.parse(args);
    const body: Record<string, unknown> = {
      ...(parsed.targetType === 'user' ? { userId: parsed.userId } : { teamId: parsed.teamId }),
      ...(normalizeNullableString(parsed.divisionId) !== undefined ? { divisionId: parsed.divisionId } : {}),
      ...(normalizeNullableString(parsed.divisionTypeId) !== undefined ? { divisionTypeId: parsed.divisionTypeId } : {}),
      ...(normalizeNullableString(parsed.divisionTypeKey) !== undefined ? { divisionTypeKey: parsed.divisionTypeKey } : {}),
      ...(normalizeNullableString(parsed.slotId) !== undefined ? { slotId: parsed.slotId } : {}),
      ...(normalizeNullableString(parsed.occurrenceDate) !== undefined ? { occurrenceDate: parsed.occurrenceDate } : {}),
    };
    const response = await fetchJsonOrToolError(
      `${params.origin}/api/events/${encodeURIComponent(parsed.eventId)}/participants`,
      {
        method: parsed.mode === 'add' ? 'POST' : 'DELETE',
        headers: authHeaders(params.owner),
        body: JSON.stringify(body),
      },
    );
    if (!response.ok) {
      return { result: { status: 'failed', httpStatus: response.status, error: redactUserFacingObjectIds(String(response.body?.error ?? 'Participant update failed.')) } };
    }
    return {
      result: {
        status: 'executed',
        summary: `${parsed.mode === 'add' ? 'Added' : 'Removed'} ${parsed.targetType} participant.`,
        warnings: response.body?.warnings ?? [],
      },
      changes: [{
        type: 'participant',
        id: parsed.targetType === 'user' ? parsed.userId ?? undefined : parsed.teamId ?? undefined,
        eventId: parsed.eventId,
        operation: parsed.mode === 'add' ? 'add' : 'remove',
        label: parsed.mode === 'add' ? 'Participant added' : 'Participant removed',
      }],
    };
  }

  if (params.name === 'regenerate_event_schedule') {
    const parsed = regenerateScheduleSchema.parse(args);
    const response = await fetchJsonOrToolError(
      `${params.origin}/api/events/${encodeURIComponent(parsed.eventId)}/schedule`,
      {
        method: 'POST',
        headers: authHeaders(params.owner),
        body: JSON.stringify({
          ...(typeof parsed.participantCount === 'number' ? { participantCount: parsed.participantCount } : {}),
        }),
      },
    );
    if (!response.ok) {
      return { result: { status: 'failed', httpStatus: response.status, error: redactUserFacingObjectIds(String(response.body?.error ?? 'Schedule regeneration failed.')) } };
    }
    return {
      result: {
        status: 'executed',
        summary: 'Regenerated the saved schedule.',
        matchCount: Array.isArray(response.body?.matches) ? response.body.matches.length : null,
        warnings: response.body?.warnings ?? [],
      },
      changes: [{ type: 'schedule', eventId: parsed.eventId, operation: 'regenerate', label: 'Schedule regenerated' }],
    };
  }

  return { result: { status: 'failed', error: `Unknown write tool: ${params.name}` } };
};

export const executeAgentTool = async (params: ExecuteToolParams): Promise<AgentToolResult> => {
  const args = parseToolArgs(params.args);

  try {
    if (params.name === 'get_site_navigation_help') {
      return {
        result: {
          status: 'ok',
          currentPath: normalizeString(args.currentPath) ?? params.pageContext?.pathname ?? null,
          topic: normalizeString(args.topic),
          ...navigationHelp,
        },
      };
    }

    if (params.name === 'build_site_link') {
      const text = normalizeString(args.text);
      const path = normalizeString(args.path);
      if (!text || !path) {
        return { result: { status: 'failed', error: 'text and path are required.' } };
      }
      const url = buildSameOriginLink(params.origin, path);
      return {
        result: {
          status: 'ok',
          text,
          url,
          markdown: `[${text}](${url})`,
        },
      };
    }

    if (params.name === 'get_page_layout_description') {
      return { result: getPageLayoutDescription(args, params.pageContext) };
    }

    if (params.name === 'get_event_form_context') {
      return { result: getEventFormContext(args, params.pageContext) };
    }

    if (params.name === 'get_event_schedule_context') {
      return { result: await getEventScheduleContext(params.owner, args, params.pageContext) };
    }

    if (params.name === 'stage_event_match_draft_update') {
      const sanitizedArgs = sanitizeArgsForTool(params.name, args);
      return createClientDraftActionResult(params, sanitizedArgs);
    }

    if (
      params.name === 'update_event_match'
      || params.name === 'update_match_score'
      || params.name === 'update_event_participant'
      || params.name === 'regenerate_event_schedule'
    ) {
      return {
        result: {
          status: 'failed',
          error: 'Direct assistant database writes are disabled. Use client-side draft actions instead.',
        },
      };
    }

    const sanitizedArgs = sanitizeArgsForTool(params.name, args);
    if (params.mode === 'prepare') {
      return createConfirmationRequiredResult(params, sanitizedArgs);
    }
    return executeWriteTool(params, sanitizedArgs);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        result: {
          status: 'failed',
          error: 'Invalid tool arguments.',
          details: error.flatten(),
        },
      };
    }
    const message = error instanceof Error ? error.message : 'Tool execution failed.';
    return { result: { status: 'failed', error: message } };
  }
};

export const executePendingConfirmation = async (params: {
  confirmationId: string;
  confirmed: boolean;
  conversationId: string;
  owner: AgentConversationOwner;
  pageContext: AgentPageContext | null;
  origin: string;
}): Promise<{
  status: 'executed' | 'cancelled' | 'save_required' | 'expired' | 'failed';
  reply: string;
  changes: AgentToolChange[];
}> => {
  const delegate = getPendingDelegate();
  const pending = await delegate.findUnique({ where: { id: params.confirmationId } });
  if (!pending || pending.openaiConversationId !== params.conversationId || pending.status !== 'PENDING') {
    return { status: 'failed', reply: 'That confirmation is no longer available.', changes: [] };
  }
  if (params.owner.type === 'user' && pending.userId !== params.owner.userId) {
    return { status: 'failed', reply: 'That confirmation does not belong to your session.', changes: [] };
  }
  if (params.owner.type === 'guest' && pending.sessionId !== params.owner.sessionId) {
    return { status: 'failed', reply: 'That confirmation does not belong to your session.', changes: [] };
  }
  if (pending.expiresAt.getTime() <= Date.now()) {
    await delegate.update({ where: { id: pending.id }, data: { status: 'EXPIRED', updatedAt: new Date() } });
    return { status: 'expired', reply: 'That confirmation expired. Ask me to prepare the action again.', changes: [] };
  }
  if (!params.confirmed) {
    await delegate.update({ where: { id: pending.id }, data: { status: 'CANCELLED', updatedAt: new Date() } });
    return { status: 'cancelled', reply: 'Cancelled. No changes were made.', changes: [] };
  }
  await delegate.update({ where: { id: pending.id }, data: { status: 'FAILED', updatedAt: new Date() } });
  return {
    status: 'failed',
    reply: 'Direct assistant database writes are disabled. Ask me to stage draft changes on the page instead.',
    changes: [],
  };
};
