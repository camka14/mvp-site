import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getOptionalSession } from '@/lib/permissions';
import { withLegacyFields } from '@/server/legacyFormat';
import { canManageEvent } from '@/server/accessControl';
import { assertCanViewEventSchedule } from '@/server/eventVisibility';
import { loadEventWithRelations } from '@/server/repositories/events';
import { serializeMatchesLegacy } from '@/server/scheduler/serialize';
import { loadLockedEventStaffSnapshot } from '@/server/events/eventStaffReconciliation';
import { GET as getEvent } from '../route';
import { GET as getParticipants } from '../participants/route';
import { GET as getTeamCompliance } from '../teams/compliance/route';
import { GET as getUserCompliance } from '../users/compliance/route';

export const dynamic = 'force-dynamic';

const normalizeId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const normalizeIdList = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(
    new Set(
      value
        .map((entry) => normalizeId(entry))
        .filter((entry): entry is string => Boolean(entry)),
    ),
  );
};

const orderByIds = <T extends { id?: string | null }>(ids: string[], rows: T[]): T[] => {
  if (!ids.length || !rows.length) {
    return rows;
  }
  const indexById = new Map(ids.map((id, index) => [id, index]));
  return [...rows].sort((left, right) => (
    (indexById.get(left.id ?? '') ?? Number.MAX_SAFE_INTEGER) -
    (indexById.get(right.id ?? '') ?? Number.MAX_SAFE_INTEGER)
  ));
};

const matchStartTime = (match: { start?: unknown }): number => {
  const start = match.start;
  if (start instanceof Date) {
    return Number.isNaN(start.getTime()) ? 0 : start.getTime();
  }
  if (typeof start === 'string') {
    const parsed = Date.parse(start);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const jsonFrom = async (response: Response): Promise<any> => (
  response.json().catch(() => null)
);

const passthrough = (payload: any, status: number) => (
  NextResponse.json(payload ?? { error: 'Request failed' }, { status })
);

const requestWithManageMode = (req: NextRequest, manage: boolean): NextRequest => {
  const url = new URL(req.url);
  if (manage) {
    url.searchParams.set('manage', 'true');
  } else {
    url.searchParams.delete('manage');
  }
  return new NextRequest(url, {
    headers: req.headers,
    method: req.method,
  });
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const routeParams = () => Promise.resolve({ eventId });

  const eventResponse = await getEvent(req, { params: routeParams() });
  const eventPayload = await jsonFrom(eventResponse);
  if (!eventResponse.ok) {
    return passthrough(eventPayload, eventResponse.status);
  }

  let canViewSchedule = false;
  try {
    const eventAccess = await prisma.events.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        state: true,
        archivedAt: true,
        hostId: true,
        assistantHostIds: true,
        organizationId: true,
      },
    });
    await assertCanViewEventSchedule(req, eventAccess);
    canViewSchedule = true;
  } catch (error) {
    // The event route intentionally retains direct-link metadata for some
    // private events.  Keep that response shape, but never hydrate or return
    // schedule relations unless the same visibility boundary as the dedicated
    // schedule endpoints grants access.
    if (error instanceof Response && error.status === 403) {
      canViewSchedule = false;
    } else if (error instanceof Response) {
      return error;
    } else {
      console.error('Event detail schedule visibility check failed', error);
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
  }

  const manageMode = req.nextUrl.searchParams.get('manage');
  const shouldLoadManageData = await (async () => {
    if (manageMode === 'true') {
      return true;
    }
    if (manageMode !== 'auto') {
      return false;
    }
    const session = await getOptionalSession(req);
    if (!session) {
      return false;
    }
    return canManageEvent(session, {
      hostId: normalizeId(eventPayload?.hostId),
      assistantHostIds: Array.isArray(eventPayload?.assistantHostIds)
        ? eventPayload.assistantHostIds
        : [],
      organizationId:
        normalizeId(eventPayload?.organizationId)
        ?? normalizeId(eventPayload?.organization?.id)
        ?? normalizeId(eventPayload?.organization?.$id),
    });
  })();
  const detailReq = requestWithManageMode(req, shouldLoadManageData);

  const participantResponse = await getParticipants(detailReq, { params: routeParams() });
  const participantPayload = await jsonFrom(participantResponse);
  if (!participantResponse.ok) {
    return passthrough(participantPayload, participantResponse.status);
  }

  try {
    const eventWithRelationsPromise = canViewSchedule
      ? loadEventWithRelations(eventId)
      : Promise.resolve(null);
    const [eventWithRelations, fieldRows, timeSlotRows, leagueScoringConfig, managedStaffState] = await Promise.all([
      eventWithRelationsPromise,
      (() => {
        const fieldIds = normalizeIdList(eventPayload?.fieldIds);
        return canViewSchedule && fieldIds.length
          ? prisma.fields.findMany({ where: { id: { in: fieldIds } } })
          : Promise.resolve([]);
      })(),
      (() => {
        const timeSlotIds = normalizeIdList(eventPayload?.timeSlotIds);
        return canViewSchedule && timeSlotIds.length
          ? prisma.timeSlots.findMany({ where: { id: { in: timeSlotIds } } })
          : Promise.resolve([]);
      })(),
      (() => {
        const scoringConfigId = normalizeId(eventPayload?.leagueScoringConfigId);
        return canViewSchedule && scoringConfigId
          ? prisma.leagueScoringConfigs.findUnique({ where: { id: scoringConfigId } })
          : Promise.resolve(null);
      })(),
      shouldLoadManageData
        ? loadLockedEventStaffSnapshot(prisma, eventId)
        : Promise.resolve(null),
    ]);

    const matches = eventWithRelations
      ? Object.values(eventWithRelations.matches)
        .sort((left, right) => matchStartTime(left) - matchStartTime(right))
      : [];
    const fieldIds = normalizeIdList(eventPayload?.fieldIds);
    const timeSlotIds = normalizeIdList(eventPayload?.timeSlotIds);

    let teamCompliance: any = null;
    let userCompliance: any = null;
    if (shouldLoadManageData) {
      const complianceResponse = eventPayload?.teamSignup
        ? await getTeamCompliance(detailReq, { params: routeParams() })
        : await getUserCompliance(detailReq, { params: routeParams() });
      const compliancePayload = await jsonFrom(complianceResponse);
      if (!complianceResponse.ok) {
        return passthrough(compliancePayload, complianceResponse.status);
      }
      if (eventPayload?.teamSignup) {
        teamCompliance = compliancePayload;
      } else {
        userCompliance = compliancePayload;
      }
    }

    const canonicalEventPayload = managedStaffState
      ? {
          ...eventPayload,
          assistantHostIds: managedStaffState.assistantHostIds,
          officialPositions: managedStaffState.officialPositions,
          eventOfficials: managedStaffState.eventOfficials,
          officialIds: managedStaffState.officialIds,
          staffInvites: managedStaffState.staffInvites,
        }
      : eventPayload;

    return NextResponse.json({
      event: canonicalEventPayload,
      participantSnapshot: participantPayload,
      matches: canViewSchedule ? serializeMatchesLegacy(matches) : [],
      fields: canViewSchedule
        ? orderByIds(fieldIds, fieldRows).map((field) => withLegacyFields(field))
        : [],
      timeSlots: canViewSchedule
        ? orderByIds(timeSlotIds, timeSlotRows).map((slot) => withLegacyFields(slot))
        : [],
      leagueScoringConfig: canViewSchedule && leagueScoringConfig
        ? withLegacyFields(leagueScoringConfig)
        : null,
      staffInvites: managedStaffState?.staffInvites
        ?? (Array.isArray(eventPayload?.staffInvites) ? eventPayload.staffInvites : []),
      staffRevision: managedStaffState?.revision ?? null,
      teamCompliance,
      userCompliance,
    }, { status: 200 });
  } catch (error) {
    if (error instanceof Error && error.message === 'Event not found') {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }
    console.error('Event detail bootstrap failed', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
