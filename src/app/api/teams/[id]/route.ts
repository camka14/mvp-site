import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getOptionalSession, requireSession } from '@/lib/permissions';
import { getRequestOrigin } from '@/lib/requestOrigin';
import { isValidOptionalExternalHttpUrl, normalizeExternalHttpUrl } from '@/lib/externalUrl';
import { withLegacyFields } from '@/server/legacyFormat';
import { sendInviteEmails } from '@/server/inviteEmails';
import {
  inferDivisionDetails,
  normalizeDivisionIdToken,
} from '@/lib/divisionTypes';
import { hasOrgPermission } from '@/server/accessControl';
import { ORG_PERMISSIONS } from '@/lib/organizationPermissions';
import { evaluateRazumlyAdminAccess } from '@/server/razumlyAdmin';
import { deleteTeamChatInTx, getTeamChatBaseMemberIds, syncTeamChatInTx } from '@/server/teamChatSync';
import { asRecord, findPresentKeys } from '@/server/http/strictPatch';
import {
  applyCanonicalTeamRegistrationMetadata,
  canManageCanonicalTeam,
  isAdminOnlyCanonicalTeam,
  loadCanonicalTeamById,
  syncCanonicalTeamRoster,
  type CreatedPendingTeamInviteRecord,
} from '@/server/teams/teamMembership';
import {
  findFutureRegisteredTeamRefs,
  syncCanonicalTeamFutureEventSnapshots,
} from '@/server/teams/teamEventSnapshotSync';
import { resolveTeamRegistrationSettings } from '@/server/teams/teamOpenRegistration';
import {
  TEAM_JOIN_POLICY_CLOSED,
  TEAM_JOIN_POLICY_OPEN_REGISTRATION,
  TEAM_JOIN_POLICY_REQUEST_TO_JOIN,
  inferTeamJoinPolicyFromOpenRegistration,
  normalizeTeamJoinPolicy,
  resolveSerializedTeamJoinPolicy,
  type TeamJoinPolicy,
} from '@/server/teams/teamJoinPolicy';
import {
  deleteOrArchiveCanonicalTeam,
  deleteOrArchiveEventTeam,
  toDeleteOrArchiveResponse,
} from '@/server/deletion/archivePolicy';

export const dynamic = 'force-dynamic';

const patchEnvelopeSchema = z.object({
  team: z.record(z.string(), z.unknown()),
}).strict();

const jerseyNumberSchema = z.string().regex(/^\d*$/, 'Jersey number must contain only digits.');

const playerRegistrationPatchSchema = z.object({
  id: z.string().optional(),
  teamId: z.string().nullable().optional(),
  userId: z.string(),
  registrantId: z.string().nullable().optional(),
  parentId: z.string().nullable().optional(),
  registrantType: z.string().nullable().optional(),
  rosterRole: z.string().nullable().optional(),
  status: z.string().optional(),
  jerseyNumber: jerseyNumberSchema.nullable().optional(),
  position: z.string().nullable().optional(),
  isCaptain: z.boolean().optional(),
  consentDocumentId: z.string().nullable().optional(),
  consentStatus: z.string().nullable().optional(),
  createdBy: z.string().nullable().optional(),
}).strict();

const teamPatchSchema = z.object({
  name: z.string().trim().min(1, 'Team name cannot be blank.').optional(),
  division: z.string().optional(),
  divisionTypeId: z.string().nullable().optional(),
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
  joinPolicy: z.enum(['CLOSED', 'OPEN_REGISTRATION', 'REQUEST_TO_JOIN']).optional(),
  openRegistration: z.boolean().optional(),
  registrationPriceCents: z.number().int().nonnegative().optional(),
  affiliateUrl: z.string().nullable().optional().refine(isValidOptionalExternalHttpUrl, {
    message: 'Enter a valid external registration link.',
  }),
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
  'sport',
  'teamSize',
  'joinPolicy',
  'openRegistration',
  'registrationPriceCents',
  'affiliateUrl',
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
  divisionTypeId: string | null;
  sport: string | null;
  playerIds: string[];
  captainId: string;
  managerId: string;
  headCoachId: string | null;
  coachIds: string[];
  pending: string[];
  teamSize: number;
  profileImageId: string | null;
  joinPolicy: TeamJoinPolicy;
  openRegistration: boolean;
  registrationPriceCents: number;
  affiliateUrl: string | null;
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
  const existingJoinPolicy = resolveSerializedTeamJoinPolicy(existing);
  const hasJoinPolicyPayload = hasOwn(payload, 'joinPolicy');
  const hasOpenRegistrationPayload = hasOwn(payload, 'openRegistration');
  const joinPolicy = hasJoinPolicyPayload
    ? normalizeTeamJoinPolicy(payload.joinPolicy, existingJoinPolicy)
    : hasOpenRegistrationPayload
      ? (
        payload.openRegistration === true
          ? TEAM_JOIN_POLICY_OPEN_REGISTRATION
          : existingJoinPolicy === TEAM_JOIN_POLICY_REQUEST_TO_JOIN
            ? TEAM_JOIN_POLICY_REQUEST_TO_JOIN
            : inferTeamJoinPolicyFromOpenRegistration(false)
      )
      : existingJoinPolicy;
  const affiliateUrl = hasOwn(payload, 'affiliateUrl')
    ? normalizeExternalHttpUrl(payload.affiliateUrl)
    : normalizeExternalHttpUrl(existing.affiliateUrl);
  const effectiveJoinPolicy = affiliateUrl ? TEAM_JOIN_POLICY_OPEN_REGISTRATION : joinPolicy;
  const registrationPriceCents = affiliateUrl
    ? 0
    : hasOwn(payload, 'registrationPriceCents')
      ? Math.max(0, Math.round(normalizeNumber(payload.registrationPriceCents, 0)))
      : Math.max(0, Math.round(normalizeNumber(existing.registrationPriceCents, 0)));
  const shouldPersistDivision = effectiveJoinPolicy !== TEAM_JOIN_POLICY_CLOSED;
  const persistedDivision = shouldPersistDivision ? normalizedDivision : '';
  const persistedDivisionTypeId = shouldPersistDivision ? divisionTypeId : null;

  return {
    name: payload.name ?? resolvedExistingName,
    division: persistedDivision,
    divisionTypeId: persistedDivisionTypeId,
    sport: sportInput,
    playerIds,
    captainId,
    managerId,
    headCoachId,
    coachIds,
    pending,
    teamSize: normalizeNumber(payload.teamSize, normalizeNumber(existing.teamSize, playerIds.length)),
    profileImageId: nextProfileImage,
    joinPolicy: effectiveJoinPolicy,
    openRegistration: effectiveJoinPolicy === TEAM_JOIN_POLICY_OPEN_REGISTRATION,
    registrationPriceCents,
    affiliateUrl,
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
        if ((normalizeText(existing.division) ?? '') !== next.division) return true;
        break;
      case 'divisionTypeId':
        if ((normalizeDivisionIdToken(existing.divisionTypeId) ?? null) !== next.divisionTypeId) return true;
        break;
      case 'sport':
        if ((normalizeText(existing.sport) ?? null) !== next.sport) return true;
        break;
      case 'teamSize':
        if (normalizeNumber(existing.teamSize, 0) !== next.teamSize) return true;
        break;
      case 'joinPolicy':
        if (resolveSerializedTeamJoinPolicy(existing) !== next.joinPolicy) return true;
        break;
      case 'openRegistration':
        if (Boolean(existing.openRegistration) !== next.openRegistration) return true;
        break;
      case 'registrationPriceCents':
        if (Math.max(0, Math.round(normalizeNumber(existing.registrationPriceCents, 0))) !== next.registrationPriceCents) return true;
        break;
      case 'affiliateUrl':
        if ((normalizeText(existing.affiliateUrl) ?? null) !== next.affiliateUrl) return true;
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
  const canonicalTeamsDelegate: any = (prisma as any).canonicalTeams;
  if (!canonicalTeamsDelegate?.findUnique) {
    return false;
  }
  const team = await canonicalTeamsDelegate.findUnique({
    where: { id: teamId },
    select: { organizationId: true },
  });
  const organizationId = normalizeText(team?.organizationId);
  if (!organizationId) {
    return false;
  }
  const organization = await prisma.organizations.findUnique({
    where: { id: organizationId },
    select: { id: true, ownerId: true },
  });
  if (!organization) {
    return false;
  }
  return hasOrgPermission(session, organization, ORG_PERMISSIONS.TEAMS_MANAGE);
};

const hasGlobalTeamAdminAccess = async (
  session: { userId: string; isAdmin: boolean },
): Promise<boolean> => {
  if (session.isAdmin) {
    return true;
  }
  const status = await evaluateRazumlyAdminAccess(session.userId);
  return status.allowed;
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const team = await loadCanonicalTeamById(id, prisma);
  if (!team) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (isAdminOnlyCanonicalTeam(team as Record<string, unknown>)) {
    const session = await getOptionalSession(req);
    const canReadHiddenTeam = session
      ? await hasGlobalTeamAdminAccess(session) || await hasOrganizationTeamManagementAccess(id, session)
      : false;
    if (!canReadHiddenTeam) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
  }
  return NextResponse.json(withTeamRoleAliases(team as any), { status: 200 });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
  const isGlobalAdmin = await hasGlobalTeamAdminAccess(session);
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
  if (adminOverrideKeys.length && !isGlobalAdmin) {
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
    const isOrganizationManager = isGlobalAdmin ? true : await hasOrganizationTeamManagementAccess(id, session);
    const canManage = await canManageCanonicalTeam({
      teamId: id,
      userId: session.userId,
      isAdmin: isGlobalAdmin,
    }, prisma);
    if (!canManage && !isOrganizationManager) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const nextState = buildTeamState(existingCanonical as Record<string, any>, payload);
    const registrationSettingsTouched = hasOwn(payload, 'joinPolicy') || hasOwn(payload, 'openRegistration') || hasOwn(payload, 'registrationPriceCents');
    const registrationSettingsChanged = registrationSettingsTouched && (
      resolveSerializedTeamJoinPolicy(existingCanonical as Record<string, any>) !== nextState.joinPolicy
      || Boolean((existingCanonical as Record<string, any>).openRegistration) !== nextState.openRegistration
      || Math.max(0, Math.round(normalizeNumber((existingCanonical as Record<string, any>).registrationPriceCents, 0))) !== nextState.registrationPriceCents
    );
    if (registrationSettingsChanged) {
      try {
        const registrationSettings = await resolveTeamRegistrationSettings({
          teamId: id,
          joinPolicy: nextState.joinPolicy,
          openRegistration: nextState.openRegistration,
          registrationPriceCents: nextState.registrationPriceCents,
        });
        nextState.joinPolicy = registrationSettings.joinPolicy;
        nextState.openRegistration = registrationSettings.openRegistration;
        nextState.registrationPriceCents = registrationSettings.registrationPriceCents;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Invalid registration settings.';
        return NextResponse.json({ error: message }, { status: 400 });
      }
    }
    if (nextState.joinPolicy === TEAM_JOIN_POLICY_CLOSED) {
      nextState.division = '';
      nextState.divisionTypeId = null;
      nextState.registrationPriceCents = 0;
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
    let createdPendingInvites: CreatedPendingTeamInviteRecord[] = [];
    const updated = await prisma.$transaction(async (tx) => {
      await tx.canonicalTeams.update({
        where: { id },
        data: {
          name: nextState.name,
          division: nextState.division,
          divisionTypeId: nextState.divisionTypeId,
          sport: nextState.sport,
          teamSize: nextState.teamSize,
          profileImageId: nextState.profileImageId,
          joinPolicy: nextState.joinPolicy,
          openRegistration: nextState.openRegistration,
          registrationPriceCents: nextState.registrationPriceCents,
          affiliateUrl: nextState.affiliateUrl,
          requiredTemplateIds: nextState.requiredTemplateIds,
          updatedAt: now,
        },
      });
      const rosterSyncResult = await syncCanonicalTeamRoster({
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
      createdPendingInvites = rosterSyncResult?.createdPendingInvites ?? [];
      await applyCanonicalTeamRegistrationMetadata({
        client: tx,
        teamId: id,
        playerRegistrations: payload.playerRegistrations,
        now,
      });
      const previousMemberIds = getTeamChatBaseMemberIds(existingCanonical as Record<string, any>);

      if (shouldSyncDerivedTeams) {
        await syncCanonicalTeamFutureEventSnapshots({
          tx,
          canonicalTeamId: id,
          createdBy: session.userId,
          now,
        });
      }

      await syncTeamChatInTx(tx, id, { previousMemberIds });
    });
    if (createdPendingInvites.length) {
      await sendInviteEmails(createdPendingInvites, getRequestOrigin(req));
    }
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
  const isOrganizationManager = (!isGlobalAdmin && !isCaptain && !isManager)
    ? await hasOrganizationTeamManagementAccess(id, session)
    : false;
  if (!isGlobalAdmin && !isCaptain && !isManager && !isOrganizationManager) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const nextState = buildTeamState(existing as Record<string, any>, payload);
  const registrationSettingsTouched = hasOwn(payload, 'joinPolicy') || hasOwn(payload, 'openRegistration') || hasOwn(payload, 'registrationPriceCents');
  const registrationSettingsChanged = registrationSettingsTouched && (
    resolveSerializedTeamJoinPolicy(existing as Record<string, any>) !== nextState.joinPolicy
    || Boolean((existing as Record<string, any>).openRegistration) !== nextState.openRegistration
    || Math.max(0, Math.round(normalizeNumber((existing as Record<string, any>).registrationPriceCents, 0))) !== nextState.registrationPriceCents
  );
  if (registrationSettingsChanged) {
    try {
      const registrationSettings = await resolveTeamRegistrationSettings({
        teamId: id,
        joinPolicy: nextState.joinPolicy,
        openRegistration: nextState.openRegistration,
        registrationPriceCents: nextState.registrationPriceCents,
      });
      nextState.joinPolicy = registrationSettings.joinPolicy;
      nextState.openRegistration = registrationSettings.openRegistration;
      nextState.registrationPriceCents = registrationSettings.registrationPriceCents;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid registration settings.';
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }
  if (nextState.joinPolicy === TEAM_JOIN_POLICY_CLOSED) {
    nextState.division = '';
    nextState.divisionTypeId = null;
    nextState.registrationPriceCents = 0;
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
      const teamRefsToUpdate = await findFutureRegisteredTeamRefs(tx, derivedTeamIds, now);
      if (teamRefsToUpdate.length) {
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
          joinPolicy: nextState.joinPolicy,
          openRegistration: nextState.openRegistration,
          registrationPriceCents: nextState.registrationPriceCents,
          affiliateUrl: nextState.affiliateUrl,
          updatedAt: now,
        };

        for (const { teamId } of teamRefsToUpdate) {
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
  const isGlobalAdmin = await hasGlobalTeamAdminAccess(session);
  const { id } = await params;
  const canonicalTeamsDelegate: any = (prisma as any).canonicalTeams;
  if (canonicalTeamsDelegate?.findUnique && canonicalTeamsDelegate?.delete) {
    const existingCanonical = await loadCanonicalTeamById(id, prisma);
    if (!existingCanonical) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const isOrganizationManager = isGlobalAdmin ? true : await hasOrganizationTeamManagementAccess(id, session);
    const canManage = await canManageCanonicalTeam({
      teamId: id,
      userId: session.userId,
      isAdmin: isGlobalAdmin,
    }, prisma);
    if (!canManage && !isOrganizationManager) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const result = await deleteOrArchiveCanonicalTeam({
      client: prisma,
      entity: existingCanonical as Record<string, any>,
      actorUserId: session.userId,
      reason: 'delete_requested',
    });
    return NextResponse.json(toDeleteOrArchiveResponse(result), { status: 200 });
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
  const isOrganizationManager = isGlobalAdmin ? true : await hasOrganizationTeamManagementAccess(id, session);
  if (!isGlobalAdmin && !isCaptain && !isManager && !isOrganizationManager) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const result = await deleteOrArchiveEventTeam({
    client: prisma,
    entity: existing as Record<string, any>,
    actorUserId: session.userId,
    reason: 'delete_requested',
  });
  if (result.action === 'deleted') {
    await prisma.$transaction(async (tx) => {
      await deleteTeamChatInTx(tx, id);
    });
  }
  return NextResponse.json(toDeleteOrArchiveResponse(result), { status: 200 });
}
