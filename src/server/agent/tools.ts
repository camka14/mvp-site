import { randomUUID } from 'crypto';
import type { Tool } from 'openai/resources/responses/responses';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import type { AgentPageContext, AgentPendingConfirmation, AgentToolChange } from '@/lib/agent/types';
import { canManageEvent } from '@/server/accessControl';
import type { AgentConversationOwner } from './conversations';
import pageLayoutDescriptions from './pageLayoutDescriptions.json';

const CONFIRMATION_TTL_MS = 10 * 60 * 1000;
const HIDDEN_EVENT_STATES = new Set(['UNPUBLISHED', 'PRIVATE', 'DRAFT']);

type ToolExecutionMode = 'prepare' | 'confirm';

export type AgentToolResult = {
  result: Record<string, unknown>;
  changes?: AgentToolChange[];
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

const writeTools: Tool[] = [
  {
    type: 'function',
    name: 'update_event_match',
    description: 'Request a confirmed update to a saved event match assignment or schedule fields: start, end, field, teams, officials, team official, lock state, division, or displayed match number.',
    strict: false,
    parameters: {
      type: 'object',
      properties: {
        eventId: { type: 'string' },
        matchId: { type: 'string' },
        updates: {
          type: 'object',
          properties: {
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
          },
          additionalProperties: false,
        },
      },
      required: ['eventId', 'matchId', 'updates'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'update_match_score',
    description: 'Request a confirmed update to saved match score arrays or segment results.',
    strict: false,
    parameters: {
      type: 'object',
      properties: {
        eventId: { type: 'string' },
        matchId: { type: 'string' },
        team1Points: { type: ['array', 'null'], items: { type: 'number' } },
        team2Points: { type: ['array', 'null'], items: { type: 'number' } },
        setResults: { type: ['array', 'null'], items: { type: 'number' } },
        segmentOperations: { type: ['array', 'null'], items: { type: 'object' } },
      },
      required: ['eventId', 'matchId'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'update_event_participant',
    description: 'Request a confirmed add or remove of a saved event participant by user ID or team ID using existing event registration rules.',
    strict: false,
    parameters: {
      type: 'object',
      properties: {
        eventId: { type: 'string' },
        mode: { type: 'string', enum: ['add', 'remove'] },
        targetType: { type: 'string', enum: ['user', 'team'] },
        userId: { type: ['string', 'null'] },
        teamId: { type: ['string', 'null'] },
        divisionId: { type: ['string', 'null'] },
        divisionTypeId: { type: ['string', 'null'] },
        divisionTypeKey: { type: ['string', 'null'] },
        slotId: { type: ['string', 'null'] },
        occurrenceDate: { type: ['string', 'null'] },
      },
      required: ['eventId', 'mode', 'targetType'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'regenerate_event_schedule',
    description: 'Request confirmed regeneration or refresh of a saved league/tournament schedule while preserving locks where the existing API does so.',
    strict: false,
    parameters: {
      type: 'object',
      properties: {
        eventId: { type: 'string' },
        participantCount: { type: ['number', 'null'] },
      },
      required: ['eventId'],
      additionalProperties: false,
    },
  },
];

export const buildAgentTools = (owner: AgentConversationOwner): Tool[] => (
  owner.type === 'user' ? [...readTools, ...writeTools] : readTools
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
    'On the Schedule tab, saved match changes can be made manually or by the assistant after confirmation.',
    'If the page has unsaved local edits, save those changes before asking the assistant to mutate the schedule.',
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
  return fullName || user.userName?.trim() || user.id || 'Unknown user';
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

export const buildSameOriginLink = (origin: string, path: string): string => {
  const trimmed = path.trim();
  if (!trimmed || /^[a-z][a-z0-9+.-]*:/i.test(trimmed) || trimmed.startsWith('//')) {
    throw new Error('Only same-site paths are supported.');
  }
  const normalizedPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  const url = new URL(normalizedPath, origin);
  const expectedOrigin = new URL(origin).origin;
  if (url.origin !== expectedOrigin) {
    throw new Error('Only same-origin BracketIQ links are supported.');
  }
  return url.toString();
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
    summary: row.summary,
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
      summary: params.summary,
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
      select: { id: true, name: true, division: true, divisionTypeId: true, divisionTypeName: true, kind: true },
      orderBy: { name: 'asc' },
    }),
    prisma.eventRegistrations.findMany({
      where: { eventId, status: { in: ['ACTIVE', 'STARTED'] } },
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
      canUseMutatingTools: owner.type === 'user' && access.canManage,
      hasUnsavedChanges: hasUnsavedScheduleChanges(pageContext),
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
      divisionTypeName: team.divisionTypeName,
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
        ? teamNameById.get(registration.eventTeamId ?? registration.registrantId) ?? registration.registrantId
        : userNameById.get(registration.registrantId) ?? registration.registrantId,
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
      fieldName: match.fieldId ? fieldNameById.get(match.fieldId) ?? match.fieldId : null,
      team1Id: match.team1Id,
      team1Name: match.team1Id ? teamNameById.get(match.team1Id) ?? match.team1Id : null,
      team2Id: match.team2Id,
      team2Name: match.team2Id ? teamNameById.get(match.team2Id) ?? match.team2Id : null,
      officialId: match.officialId,
      officialName: match.officialId ? userNameById.get(match.officialId) ?? match.officialId : null,
      officialIds: match.officialIds,
      teamOfficialId: match.teamOfficialId,
      teamOfficialName: match.teamOfficialId ? teamNameById.get(match.teamOfficialId) ?? match.teamOfficialId : null,
      team1Points: match.team1Points,
      team2Points: match.team2Points,
      setResults: match.setResults,
      division: match.division,
      losersBracket: match.losersBracket,
    })),
  };
};

const updateMatchSchema = z.object({
  eventId: z.string().min(1),
  matchId: z.string().min(1),
  updates: z.object({
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
  }).strict(),
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

const sanitizeArgsForTool = (name: string, args: Record<string, unknown>): Record<string, unknown> => {
  switch (name) {
    case 'update_event_match': {
      const parsed = updateMatchSchema.parse(args);
      const updates = Object.fromEntries(
        Object.entries(parsed.updates).filter(([, value]) => value !== undefined && value !== null),
      );
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

const summarizeWriteTool = async (toolName: string, args: Record<string, unknown>): Promise<string> => {
  const eventId = normalizeString(args.eventId);
  const event = eventId
    ? await prisma.events.findUnique({ where: { id: eventId }, select: { name: true } })
    : null;
  const eventLabel = event?.name ? `"${event.name}"` : 'this event';

  switch (toolName) {
    case 'update_event_match':
      return `Update match ${normalizeString(args.matchId) ?? ''} for ${eventLabel}. Fields: ${Object.keys((args.updates ?? {}) as object).join(', ') || 'none'}.`;
    case 'update_match_score':
      return `Update score/results for match ${normalizeString(args.matchId) ?? ''} in ${eventLabel}.`;
    case 'update_event_participant': {
      const targetId = normalizeString(args.userId) ?? normalizeString(args.teamId) ?? 'selected participant';
      return `${args.mode === 'remove' ? 'Remove' : 'Add'} ${String(args.targetType)} ${targetId} ${args.mode === 'remove' ? 'from' : 'to'} ${eventLabel}.`;
    }
    case 'regenerate_event_schedule':
      return `Regenerate or refresh the saved schedule for ${eventLabel}.`;
    default:
      return `Run ${toolName} for ${eventLabel}.`;
  }
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
    const response = await fetchJsonOrToolError(
      `${params.origin}/api/events/${encodeURIComponent(parsed.eventId)}/matches/${encodeURIComponent(parsed.matchId)}`,
      {
        method: 'PATCH',
        headers: authHeaders(params.owner),
        body: JSON.stringify(parsed.updates),
      },
    );
    if (!response.ok) {
      return { result: { status: 'failed', httpStatus: response.status, error: response.body?.error ?? 'Match update failed.' } };
    }
    return {
      result: {
        status: 'executed',
        summary: `Updated match ${parsed.matchId}.`,
        match: response.body?.match ?? null,
      },
      changes: [{ type: 'match', id: parsed.matchId, eventId: parsed.eventId, operation: 'update', label: 'Match updated' }],
    };
  }

  if (params.name === 'update_match_score') {
    const parsed = updateScoreSchema.parse(args);
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
      return { result: { status: 'failed', httpStatus: response.status, error: response.body?.error ?? 'Score update failed.' } };
    }
    return {
      result: {
        status: 'executed',
        summary: `Updated score for match ${parsed.matchId}.`,
        match: response.body?.match ?? null,
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
      return { result: { status: 'failed', httpStatus: response.status, error: response.body?.error ?? 'Participant update failed.' } };
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
      return { result: { status: 'failed', httpStatus: response.status, error: response.body?.error ?? 'Schedule regeneration failed.' } };
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

    if (params.name === 'get_event_schedule_context') {
      return { result: await getEventScheduleContext(params.owner, args, params.pageContext) };
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
  if (hasUnsavedScheduleChanges(params.pageContext)) {
    return {
      status: 'save_required',
      reply: 'The schedule page has unsaved changes. Save them first, then confirm or ask me to prepare the action again.',
      changes: [],
    };
  }

  const execution = await executeAgentTool({
    name: pending.toolName,
    args: pending.args,
    owner: params.owner,
    conversationId: params.conversationId,
    pageContext: params.pageContext,
    origin: params.origin,
    mode: 'confirm',
  });

  if (execution.result.status === 'save_required') {
    return {
      status: 'save_required',
      reply: String(execution.result.error ?? 'Save changes first.'),
      changes: [],
    };
  }

  const status = execution.result.status === 'executed' ? 'EXECUTED' : 'FAILED';
  await delegate.update({ where: { id: pending.id }, data: { status, updatedAt: new Date() } });

  if (execution.result.status !== 'executed') {
    return {
      status: 'failed',
      reply: String(execution.result.error ?? 'The action could not be completed.'),
      changes: [],
    };
  }

  return {
    status: 'executed',
    reply: String(execution.result.summary ?? 'Action completed.'),
    changes: execution.changes ?? [],
  };
};
