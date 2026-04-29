import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { withLegacyFields } from '@/server/legacyFormat';
import {
  inferDivisionDetails,
  normalizeDivisionIdToken,
} from '@/lib/divisionTypes';
import { canManageOrganization } from '@/server/accessControl';
import { deleteTeamChatInTx, getTeamChatBaseMemberIds, syncTeamChatInTx } from '@/server/teamChatSync';
import { asRecord, findPresentKeys } from '@/server/http/strictPatch';
import {
  applyCanonicalTeamRegistrationMetadata,
  canManageCanonicalTeam,
  loadCanonicalTeamById,
  syncCanonicalTeamRoster,
} from '@/server/teams/teamMembership';
import { resolveTeamRegistrationSettings } from '@/server/teams/teamOpenRegistration';

export const dynamic = 'force-dynamic';

const patchEnvelopeSchema = z.object({
  team: z.record(z.string(), z.unknown()),
}).strict();

const jerseyNumberSchema = z.string().regex(/^\d*$/, 'Jersey number must contain only digits.');

const playerRegistrationPatchSchema = z.object({
  id: z.string().optional(),
  teamId: z.string().nullable().optional(),
  userId: z.string(),
  status: z.string().optional(),
  jerseyNumber: jerseyNumberSchema.nullable().optional(),
  position: z.string().nullable().optional(),
  isCaptain: z.boolean().optional(),
}).strict();

const teamPatchSchema = z.object({
  name: z.string().trim().min(1, 'Team name cannot be blank.').optional(),
  division: z.string().optional(),
  divisionTypeId: z.string().optional(),
  divisionTypeName: z.string().optional(),
  sport: z.string().optional(),
  playerIds: z.array(z.string()).optional(),
  captainId: z.string().optional(),
  managerId: z.string().optional(),
  headCoachId: z.string().nullable().optional(),
  assistantCoachIds: z.array(z.string()).optional(),
  coachIds: z.array(z.string()).optional(),
  pending: z.array(z.string()).optional(),
  teamSize: z.number().optional(),
  profileImageId: z.string().optional(),
  profileImage: z.string().optional(),
  openRegistration: z.boolean().optional(),
  registrationPriceCents: z.number().int().nonnegative().optional(),
  requiredTemplateIds: z.array(z.string()).optional(),
  parentTeamId: z.string().nullable().optional(),
  playerRegistrations: z.array(playerRegistrationPatchSchema).optional(),
}).strict();

const TEAM_HARD_IMMUTABLE_FIELDS = new Set<string>([
  'id',
  '$id',
  'createdAt',
  '$createdAt',
  'updatedAt',
  '$updatedAt',
]);
const TEAM_ADMIN_OVERRIDABLE_FIELDS = new Set<string>([
  'parentTeamId',
]);

const VERSIONED_PROFILE_FIELDS: ReadonlySet<string> = new Set([
  'name',
  'division',
  'divisionTypeId',
  'divisionTypeName',
  'sport',
  'teamSize',
  'openRegistration',
  'registrationPriceCents',
  'requiredTemplateIds',
  'playerIds',
  'captainId',
  'managerId',
  'headCoachId',
  'assistantCoachIds',
  'coachIds',
]);

const normalizeText = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length ? normalized : null;
};

const fallbackTeamNameFromId = (value: unknown): string => {
  const normalizedId = normalizeText(value);
  if (!normalizedId) {
    return 'Team';
  }
  return `Team ${normalizedId.slice(0, 8)}`;
};

const normalizeTeamNameOrFallback = (name: unknown, teamId: unknown): string => (
  normalizeText(name) ?? fallbackTeamNameFromId(teamId)
);

const toUniqueStrings = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(
    new Set(
      value
        .map((entry) => String(entry).trim())
        .filter(Boolean),
    ),
  );
};

const normalizeTemplateIds = (value: unknown): string[] => (
  Array.from(
    new Set(
      (Array.isArray(value) ? value : [])
        .map((entry) => normalizeText(entry))
        .filter((entry): entry is string => Boolean(entry)),
    ),
  )
);

const resolveValidatedRequiredTemplateIds = async (
  organizationId: string | null,
  templateIds: string[],
): Promise<string[]> => {
  if (!organizationId || !templateIds.length) {
    return [];
  }
  const templates = await prisma.templateDocuments.findMany({
    where: {
      id: { in: templateIds },
      organizationId,
    },
    select: { id: true },
  });
  const foundIds = new Set(templates.map((template) => template.id));
  const missingIds = templateIds.filter((templateId) => !foundIds.has(templateId));
  if (missingIds.length) {
    throw new Error(`Required team document templates not found: ${missingIds.join(', ')}`);
  }
  return templateIds;
};

const normalizeNumber = (value: unknown, fallback: number): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const hasOwn = (value: object, key: string): boolean => (
  Object.prototype.hasOwnProperty.call(value, key)
);

const replaceTeamId = (ids: string[], fromId: string, toId: string): string[] => (
  Array.from(
    new Set(
      ids
        .map((value) => (value === fromId ? toId : value))
        .filter(Boolean),
    ),
  )
);

const arraysEqual = (a: string[], b: string[]): boolean => (
  a.length === b.length && a.every((value, index) => value === b[index])
);

type TeamState = {
  name: string;
  division: string;
  divisionTypeId: string;
  divisionTypeName: string;
  sport: string | null;
  playerIds: string[];
  captainId: string;
  managerId: string;
  headCoachId: string | null;
  coachIds: string[];
  pending: string[];
  teamSize: number;
  profileImageId: string | null;
  openRegistration: boolean;
  registrationPriceCents: number;
  requiredTemplateIds: string[];
};

const buildTeamState = (
  existing: Record<string, any>,
  payload: z.infer<typeof teamPatchSchema>,
): TeamState => {
  const resolvedExistingName = normalizeTeamNameOrFallback(existing.name, existing.id);
  const normalizedDivision = normalizeText(payload.division)
    ?? normalizeText(existing.division)
    ?? 'Open';
  const sportInput = normalizeText(payload.sport)
    ?? normalizeText(existing.sport)
    ?? null;
  const normalizedDivisionTypeId = normalizeDivisionIdToken(payload.divisionTypeId)
    ?? normalizeDivisionIdToken(existing.divisionTypeId);
  const inferredDivision = inferDivisionDetails({
    identifier: normalizedDivisionTypeId ?? normalizedDivision,
    sportInput: sportInput ?? undefined,
  });
  const divisionTypeId = normalizedDivisionTypeId ?? inferredDivision.divisionTypeId;
  const divisionTypeName = normalizeText(payload.divisionTypeName)
    ?? normalizeText(existing.divisionTypeName)
    ?? inferredDivision.divisionTypeName;

  const captainId = hasOwn(payload, 'captainId')
    ? (normalizeText(payload.captainId) ?? '')
    : (normalizeText(existing.captainId) ?? '');
  const hasStoredManagerId = typeof existing.managerId === 'string';
  const managerId = hasOwn(payload, 'managerId')
    ? (normalizeText(payload.managerId) ?? '')
    : (hasStoredManagerId ? String(existing.managerId).trim() : captainId);
  const headCoachId = hasOwn(payload, 'headCoachId')
    ? normalizeText(payload.headCoachId)
    : (normalizeText(existing.headCoachId) ?? null);

  const playerIdsInput = payload.playerIds ?? existing.playerIds;
  const playerIds = toUniqueStrings(playerIdsInput);
  if (captainId && !playerIds.includes(captainId)) {
    playerIds.unshift(captainId);
  }

  const coachIdsInput = payload.assistantCoachIds ?? payload.coachIds ?? existing.coachIds;
  const coachIds = toUniqueStrings(coachIdsInput);

  const pendingInput = payload.pending ?? existing.pending;
  const pending = toUniqueStrings(pendingInput)
    .filter((userId) => !playerIds.includes(userId));

  const nextProfileImage = normalizeText(payload.profileImageId ?? payload.profileImage)
    ?? normalizeText(existing.profileImageId)
    ?? null;

  return {
    name: payload.name ?? resolvedExistingName,
    division: normalizedDivision,
    divisionTypeId,
    divisionTypeName,
    sport: sportInput,
    playerIds,
    captainId,
    managerId,
    headCoachId,
    coachIds,
    pending,
    teamSize: normalizeNumber(payload.teamSize, normalizeNumber(existing.teamSize, playerIds.length)),
    profileImageId: nextProfileImage,
    openRegistration: hasOwn(payload, 'openRegistration')
      ? Boolean(payload.openRegistration)
      : Boolean(existing.openRegistration),
    registrationPriceCents: hasOwn(payload, 'registrationPriceCents')
      ? Math.max(0, Math.round(normalizeNumber(payload.registrationPriceCents, 0)))
      : Math.max(0, Math.round(normalizeNumber(existing.registrationPriceCents, 0))),
    requiredTemplateIds: hasOwn(payload, 'requiredTemplateIds')
      ? normalizeTemplateIds(payload.requiredTemplateIds)
      : normalizeTemplateIds(existing.requiredTemplateIds),
  };
};

const hasVersionedProfileChanges = (
  payload: z.infer<typeof teamPatchSchema>,
  existing: Record<string, any>,
  next: TeamState,
): boolean => {
  const keys = Object.keys(payload).filter((key) => VERSIONED_PROFILE_FIELDS.has(key));
  if (!keys.length) {
    return false;
  }

  for (const key of keys) {
    switch (key) {
      case 'name':
        if (normalizeTeamNameOrFallback(existing.name, existing.id) !== next.name) return true;
        break;
      case 'division':
        if ((normalizeText(existing.division) ?? 'Open') !== next.division) return true;
        break;
      case 'divisionTypeId':
        if ((normalizeDivisionIdToken(existing.divisionTypeId) ?? '') !== next.divisionTypeId) return true;
        break;
      case 'divisionTypeName':
        if ((normalizeText(existing.divisionTypeName) ?? '') !== next.divisionTypeName) return true;
        break;
      case 'sport':
        if ((normalizeText(existing.sport) ?? null) !== next.sport) return true;
        break;
      case 'teamSize':
        if (normalizeNumber(existing.teamSize, 0) !== next.teamSize) return true;
        break;
      case 'openRegistration':
        if (Boolean(existing.openRegistration) !== next.openRegistration) return true;
        break;
      case 'registrationPriceCents':
        if (Math.max(0, Math.round(normalizeNumber(existing.registrationPriceCents, 0))) !== next.registrationPriceCents) return true;
        break;
      case 'requiredTemplateIds': {
        const previous = [...normalizeTemplateIds(existing.requiredTemplateIds)].sort();
        const updated = [...next.requiredTemplateIds].sort();
        if (!arraysEqual(previous, updated)) return true;
        break;
      }
      case 'playerIds': {
        const previous = [...toUniqueStrings(existing.playerIds)].sort();
        const updated = [...next.playerIds].sort();
        if (!arraysEqual(previous, updated)) return true;
        break;
      }
      case 'captainId':
        if ((normalizeText(existing.captainId) ?? '') !== next.captainId) return true;
        break;
      case 'managerId':
        if ((normalizeText(existing.managerId) ?? '') !== next.managerId) return true;
        break;
      case 'headCoachId':
        if ((normalizeText(existing.headCoachId) ?? null) !== next.headCoachId) return true;
        break;
      case 'assistantCoachIds':
      case 'coachIds':
        if (!arraysEqual(toUniqueStrings(existing.coachIds), next.coachIds)) return true;
        break;
      default:
        break;
    }
  }

  return false;
};

const withTeamRoleAliases = (team: Record<string, any>) => {
  const formatted = withLegacyFields(team);
  const assistantCoachIds = toUniqueStrings((formatted as any).assistantCoachIds ?? (formatted as any).coachIds);
  return {
    ...formatted,
    assistantCoachIds,
    coachIds: assistantCoachIds,
  };
};

const getTeamsDelegate = (client: any) => client?.teams ?? client?.volleyBallTeams;
const ACTIVE_EVENT_REGISTRATION_STATUSES = ['STARTED', 'ACTIVE', 'BLOCKED'] as const;

const findFutureRegisteredTeamIds = async (
  client: any,
  teamIds: string[],
  now: Date,
): Promise<string[]> => {
  const registrationRows = teamIds.length && typeof client.eventRegistrations?.findMany === 'function'
    ? await client.eventRegistrations.findMany({
      where: {
        registrantType: 'TEAM',
        rosterRole: 'PARTICIPANT',
        status: { in: [...ACTIVE_EVENT_REGISTRATION_STATUSES] },
        registrantId: { in: teamIds },
        slotId: null,
        occurrenceDate: null,
      },
      select: {
        eventId: true,
        registrantId: true,
      },
    })
    : [];
  const eventIds = Array.from(new Set(
    registrationRows
      .map((row: { eventId?: unknown }) => normalizeText(row.eventId))
      .filter((eventId: string | undefined): eventId is string => Boolean(eventId)),
  ));
  if (!eventIds.length) {
    return [];
  }

  const futureEvents = await client.events.findMany({
    where: {
      id: { in: eventIds },
      end: { gte: now },
    },
    select: { id: true },
  });
  const futureEventIds = new Set(
    futureEvents
      .map((event: { id?: unknown }) => normalizeText(event.id))
      .filter((eventId: string | undefined): eventId is string => Boolean(eventId)),
  );

  return Array.from(new Set(
    registrationRows
      .filter((row: { eventId?: unknown }) => {
        const eventId = normalizeText(row.eventId);
        return Boolean(eventId && futureEventIds.has(eventId));
      })
      .map((row: { registrantId?: unknown }) => normalizeText(row.registrantId))
      .filter((teamId: string | undefined): teamId is string => Boolean(teamId)),
  ));
};
const UNKNOWN_ARGUMENT_REGEX = /Unknown argument `([^`]+)`/i;

const extractUnknownArgument = (error: unknown): string | null => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const match = message.match(UNKNOWN_ARGUMENT_REGEX);
  return match?.[1] ?? null;
};

const omitKeys = (data: Record<string, unknown>, keys: Set<string>): Record<string, unknown> => {
  if (!keys.size) return data;
  return Object.fromEntries(Object.entries(data).filter(([key]) => !keys.has(key)));
};

const updateTeamWithCompatibility = async (
  teamsDelegate: any,
  where: Record<string, unknown>,
  data: Record<string, unknown>,
): Promise<Record<string, unknown>> => {
  const omittedKeys = new Set<string>();
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      return await teamsDelegate.update({
        where,
        data: omitKeys(data, omittedKeys),
      });
    } catch (error) {
      lastError = error;
      const unknownArgument = extractUnknownArgument(error);
      if (!unknownArgument || omittedKeys.has(unknownArgument) || !Object.prototype.hasOwnProperty.call(data, unknownArgument)) {
        throw error;
      }
      omittedKeys.add(unknownArgument);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Failed to update team with compatible schema.');
};

const createTeamWithCompatibility = async (
  teamsDelegate: any,
  data: Record<string, unknown>,
): Promise<Record<string, unknown>> => {
  const omittedKeys = new Set<string>();
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      return await teamsDelegate.create({
        data: omitKeys(data, omittedKeys),
      });
    } catch (error) {
      lastError = error;
      const unknownArgument = extractUnknownArgument(error);
      if (!unknownArgument || omittedKeys.has(unknownArgument) || !Object.prototype.hasOwnProperty.call(data, unknownArgument)) {
        throw error;
      }
      omittedKeys.add(unknownArgument);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Failed to create team with compatible schema.');
};

const hasOrganizationTeamManagementAccess = async (
  teamId: string,
  session: { userId: string; isAdmin: boolean },
): Promise<boolean> => {
  if (!teamId || !session.userId) return false;
  const team = await prisma.canonicalTeams.findUnique({
    where: { id: teamId },
    select: { organizationId: true },
  });
  const organizationId = normalizeText(team?.organizationId);
  if (!organizationId) {
    return false;
  }
  const organization = await prisma.organizations.findUnique({
    where: { id: organizationId },
    select: { id: true, ownerId: true, hostIds: true, officialIds: true },
  });
  if (!organization) {
    return false;
  }
  return canManageOrganization(session, organization);
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const team = await loadCanonicalTeamById(id, prisma);
  if (!team) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json(withTeamRoleAliases(team as any), { status: 200 });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const envelope = patchEnvelopeSchema.safeParse(body ?? {});
  if (!envelope.success) {
    return NextResponse.json({ error: 'Invalid input', details: envelope.error.flatten() }, { status: 400 });
  }

  const payloadRaw = envelope.data.team;
  const payloadRecord = asRecord(payloadRaw) ?? {};
  const hardImmutableKeys = findPresentKeys(payloadRecord, TEAM_HARD_IMMUTABLE_FIELDS);
  if (hardImmutableKeys.length) {
    return NextResponse.json(
      { error: 'Immutable team fields cannot be updated.', fields: hardImmutableKeys },
      { status: 403 },
    );
  }
  const adminOverrideKeys = findPresentKeys(payloadRecord, TEAM_ADMIN_OVERRIDABLE_FIELDS);
  if (adminOverrideKeys.length && !session.isAdmin) {
    return NextResponse.json(
      { error: 'Immutable team fields cannot be updated.', fields: adminOverrideKeys },
      { status: 403 },
    );
  }

  const payloadParsed = teamPatchSchema.safeParse(payloadRaw);
  if (!payloadParsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: payloadParsed.error.flatten() }, { status: 400 });
  }

  const { id } = await params;
  const payload = payloadParsed.data;
  const now = new Date();
  const canonicalTeamsDelegate: any = (prisma as any).canonicalTeams;

  if (canonicalTeamsDelegate?.findUnique && canonicalTeamsDelegate?.update) {
    const existingCanonical = await loadCanonicalTeamById(id, prisma);
    if (!existingCanonical) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const isOrganizationManager = await hasOrganizationTeamManagementAccess(id, session);
    const canManage = await canManageCanonicalTeam({
      teamId: id,
      userId: session.userId,
      isAdmin: session.isAdmin,
    }, prisma);
    if (!canManage && !isOrganizationManager) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const nextState = buildTeamState(existingCanonical as Record<string, any>, payload);
    const registrationSettingsTouched = hasOwn(payload, 'openRegistration') || hasOwn(payload, 'registrationPriceCents');
    const registrationSettingsChanged = registrationSettingsTouched && (
      Boolean((existingCanonical as Record<string, any>).openRegistration) !== nextState.openRegistration
      || Math.max(0, Math.round(normalizeNumber((existingCanonical as Record<string, any>).registrationPriceCents, 0))) !== nextState.registrationPriceCents
    );
    if (registrationSettingsChanged) {
      try {
        const registrationSettings = await resolveTeamRegistrationSettings({
          teamId: id,
          openRegistration: nextState.openRegistration,
          registrationPriceCents: nextState.registrationPriceCents,
        });
        nextState.openRegistration = registrationSettings.openRegistration;
        nextState.registrationPriceCents = registrationSettings.registrationPriceCents;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Invalid registration settings.';
        return NextResponse.json({ error: message }, { status: 400 });
      }
    }
    try {
      nextState.requiredTemplateIds = await resolveValidatedRequiredTemplateIds(
        normalizeText((existingCanonical as Record<string, any>).organizationId),
        nextState.requiredTemplateIds,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid required team documents.';
      return NextResponse.json({ error: message }, { status: 400 });
    }
    const shouldSyncDerivedTeams = hasVersionedProfileChanges(payload, existingCanonical as Record<string, any>, nextState);
    const updated = await prisma.$transaction(async (tx) => {
      await tx.canonicalTeams.update({
        where: { id },
        data: {
          name: nextState.name,
          division: nextState.division,
          divisionTypeId: nextState.divisionTypeId,
          divisionTypeName: nextState.divisionTypeName,
          sport: nextState.sport,
          teamSize: nextState.teamSize,
          profileImageId: nextState.profileImageId,
          openRegistration: nextState.openRegistration,
          registrationPriceCents: nextState.registrationPriceCents,
          requiredTemplateIds: nextState.requiredTemplateIds,
          updatedAt: now,
        },
      });
      await syncCanonicalTeamRoster({
        teamId: id,
        captainId: nextState.captainId,
        playerIds: nextState.playerIds,
        pendingPlayerIds: nextState.pending,
        managerId: nextState.managerId,
        headCoachId: nextState.headCoachId,
        assistantCoachIds: nextState.coachIds,
        actingUserId: session.userId,
        now,
      }, tx);
      await applyCanonicalTeamRegistrationMetadata({
        client: tx,
        teamId: id,
        playerRegistrations: payload.playerRegistrations,
        now,
      });
      const teamsToSync = new Set<string>([id]);
      const previousMemberIdsByTeamId = new Map<string, string[]>([
        [id, getTeamChatBaseMemberIds(existingCanonical as Record<string, any>)],
      ]);

      if (shouldSyncDerivedTeams) {
        const txTeams = getTeamsDelegate(tx);
        if (!txTeams?.findMany || !txTeams?.update || !tx.events?.findMany || !tx.eventRegistrations?.findMany) {
          throw new Error('Team storage is unavailable in transaction.');
        }

        const derivedTeams = await txTeams.findMany({
          where: { parentTeamId: id },
          select: {
            id: true,
            captainId: true,
            managerId: true,
            headCoachId: true,
            coachIds: true,
            playerIds: true,
          },
        });
        const derivedTeamById = new Map(derivedTeams.map((team: any) => [team.id, team]));
        const derivedTeamIds = derivedTeams.map((team: { id: string }) => team.id).filter(Boolean);
        if (derivedTeamIds.length) {
          const teamIdsToUpdate = new Set(await findFutureRegisteredTeamIds(tx, derivedTeamIds, now));

          if (teamIdsToUpdate.size) {
            const updatePayload = {
              name: nextState.name,
              playerIds: nextState.playerIds,
              captainId: nextState.captainId,
              managerId: nextState.managerId,
              headCoachId: nextState.headCoachId,
              coachIds: nextState.coachIds,
              teamSize: nextState.teamSize,
              profileImageId: nextState.profileImageId,
              sport: nextState.sport,
              divisionTypeId: nextState.divisionTypeId,
              divisionTypeName: nextState.divisionTypeName,
              updatedAt: now,
            };

            for (const teamId of teamIdsToUpdate) {
              const previousTeam = derivedTeamById.get(teamId);
              if (previousTeam) {
                previousMemberIdsByTeamId.set(teamId, getTeamChatBaseMemberIds(previousTeam));
              }
              await txTeams.update({
                where: { id: teamId },
                data: updatePayload,
              });
              teamsToSync.add(teamId);
            }
          }
        }
      }

      for (const teamId of teamsToSync) {
        await syncTeamChatInTx(tx, teamId, {
          previousMemberIds: previousMemberIdsByTeamId.get(teamId),
        });
      }
    });
    const refreshed = await loadCanonicalTeamById(id, prisma);
    return NextResponse.json(withTeamRoleAliases((refreshed ?? updated) as any), { status: 200 });
  }

  const teamsDelegate = getTeamsDelegate(prisma);
  if (!teamsDelegate?.findUnique || !teamsDelegate?.update) {
    return NextResponse.json({ error: 'Team storage is unavailable. Regenerate Prisma client.' }, { status: 500 });
  }

  const existing = await teamsDelegate.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const isCaptain = existing.captainId === session.userId;
  const isManager = normalizeText((existing as any).managerId) === session.userId;
  const isOrganizationManager = (!session.isAdmin && !isCaptain && !isManager)
    ? await hasOrganizationTeamManagementAccess(id, session)
    : false;
  if (!session.isAdmin && !isCaptain && !isManager && !isOrganizationManager) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const nextState = buildTeamState(existing as Record<string, any>, payload);
  const registrationSettingsTouched = hasOwn(payload, 'openRegistration') || hasOwn(payload, 'registrationPriceCents');
  const registrationSettingsChanged = registrationSettingsTouched && (
    Boolean((existing as Record<string, any>).openRegistration) !== nextState.openRegistration
    || Math.max(0, Math.round(normalizeNumber((existing as Record<string, any>).registrationPriceCents, 0))) !== nextState.registrationPriceCents
  );
  if (registrationSettingsChanged) {
    try {
      const registrationSettings = await resolveTeamRegistrationSettings({
        teamId: id,
        openRegistration: nextState.openRegistration,
        registrationPriceCents: nextState.registrationPriceCents,
      });
      nextState.openRegistration = registrationSettings.openRegistration;
      nextState.registrationPriceCents = registrationSettings.registrationPriceCents;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid registration settings.';
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }
  try {
    nextState.requiredTemplateIds = await resolveValidatedRequiredTemplateIds(
      normalizeText((existing as Record<string, any>).organizationId),
      nextState.requiredTemplateIds,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid required team documents.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const txTeams = getTeamsDelegate(tx);
    if (!txTeams?.update || !txTeams?.findMany) {
      throw new Error('Team storage is unavailable in transaction.');
    }

    const canonical = await updateTeamWithCompatibility(
      txTeams,
      { id },
        {
          ...nextState,
          updatedAt: now,
        },
    );
    await applyCanonicalTeamRegistrationMetadata({
      client: tx,
      teamId: id,
      playerRegistrations: payload.playerRegistrations,
      now,
    });
    const teamsToSync = new Set<string>([id]);
    const previousMemberIdsByTeamId = new Map<string, string[]>([
      [id, getTeamChatBaseMemberIds(existing as Record<string, any>)],
    ]);

    const derivedTeams = await txTeams.findMany({
      where: { parentTeamId: id },
      select: {
        id: true,
        captainId: true,
        managerId: true,
        headCoachId: true,
        coachIds: true,
        playerIds: true,
      },
    });
    const derivedTeamById = new Map(derivedTeams.map((team: any) => [team.id, team]));
    const derivedTeamIds = derivedTeams.map((team: { id: string }) => team.id).filter(Boolean);
    if (derivedTeamIds.length) {
      const teamIdsToUpdate = new Set(await findFutureRegisteredTeamIds(tx, derivedTeamIds, now));
      if (teamIdsToUpdate.size) {
        const updatePayload = {
          name: nextState.name,
          playerIds: nextState.playerIds,
          captainId: nextState.captainId,
          managerId: nextState.managerId,
          headCoachId: nextState.headCoachId,
          coachIds: nextState.coachIds,
          teamSize: nextState.teamSize,
          profileImageId: nextState.profileImageId,
          sport: nextState.sport,
          divisionTypeId: nextState.divisionTypeId,
          divisionTypeName: nextState.divisionTypeName,
          openRegistration: nextState.openRegistration,
          registrationPriceCents: nextState.registrationPriceCents,
          updatedAt: now,
        };

        for (const teamId of teamIdsToUpdate) {
          const previousTeam = derivedTeamById.get(teamId);
          if (previousTeam) {
            previousMemberIdsByTeamId.set(teamId, getTeamChatBaseMemberIds(previousTeam));
          }
          await updateTeamWithCompatibility(txTeams, { id: teamId }, updatePayload);
          teamsToSync.add(teamId);
        }
      }
    }

    for (const teamId of teamsToSync) {
      await syncTeamChatInTx(tx, teamId, {
        previousMemberIds: previousMemberIdsByTeamId.get(teamId),
      });
    }

    return canonical;
  });

  return NextResponse.json(withTeamRoleAliases(updated as any), { status: 200 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
  const { id } = await params;
  const canonicalTeamsDelegate: any = (prisma as any).canonicalTeams;
  if (canonicalTeamsDelegate?.findUnique && canonicalTeamsDelegate?.delete) {
    const existingCanonical = await loadCanonicalTeamById(id, prisma);
    if (!existingCanonical) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const isOrganizationManager = await hasOrganizationTeamManagementAccess(id, session);
    const canManage = await canManageCanonicalTeam({
      teamId: id,
      userId: session.userId,
      isAdmin: session.isAdmin,
    }, prisma);
    if (!canManage && !isOrganizationManager) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await prisma.$transaction(async (tx) => {
      await deleteTeamChatInTx(tx, id);
      await tx.teamRegistrations?.updateMany?.({
        where: { teamId: id },
        data: {
          status: 'REMOVED',
          updatedAt: new Date(),
        },
      });
      await tx.teamStaffAssignments?.updateMany?.({
        where: { teamId: id },
        data: {
          status: 'REMOVED',
          updatedAt: new Date(),
        },
      });
      await tx.canonicalTeams.delete({ where: { id } });
    });
    return NextResponse.json({ deleted: true }, { status: 200 });
  }

  const teamsDelegate = getTeamsDelegate(prisma);
  if (!teamsDelegate?.findUnique || !teamsDelegate?.delete) {
    return NextResponse.json({ error: 'Team storage is unavailable. Regenerate Prisma client.' }, { status: 500 });
  }

  const existing = await teamsDelegate.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const isCaptain = existing.captainId === session.userId;
  const isManager = normalizeText((existing as any).managerId) === session.userId;
  const isOrganizationManager = await hasOrganizationTeamManagementAccess(id, session);
  if (!session.isAdmin && !isCaptain && !isManager && !isOrganizationManager) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await prisma.$transaction(async (tx) => {
    const txTeams = getTeamsDelegate(tx);
    if (!txTeams?.delete) {
      throw new Error('Team storage is unavailable in transaction.');
    }
    await deleteTeamChatInTx(tx, id);
    await txTeams.delete({ where: { id } });
  });
  return NextResponse.json({ deleted: true }, { status: 200 });
}
