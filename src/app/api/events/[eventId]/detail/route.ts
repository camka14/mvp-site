import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withLegacyFields } from '@/server/legacyFormat';
import { loadEventWithRelations } from '@/server/repositories/events';
import { serializeMatchesLegacy } from '@/server/scheduler/serialize';
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

export async function GET(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const routeParams = () => Promise.resolve({ eventId });

  const eventResponse = await getEvent(req, { params: routeParams() });
  const eventPayload = await jsonFrom(eventResponse);
  if (!eventResponse.ok) {
    return passthrough(eventPayload, eventResponse.status);
  }

  const participantResponse = await getParticipants(req, { params: routeParams() });
  const participantPayload = await jsonFrom(participantResponse);
  if (!participantResponse.ok) {
    return passthrough(participantPayload, participantResponse.status);
  }

  try {
    const [eventWithRelations, fieldRows, timeSlotRows, leagueScoringConfig] = await Promise.all([
      loadEventWithRelations(eventId),
      (() => {
        const fieldIds = normalizeIdList(eventPayload?.fieldIds);
        return fieldIds.length
          ? prisma.fields.findMany({ where: { id: { in: fieldIds } } })
          : Promise.resolve([]);
      })(),
      (() => {
        const timeSlotIds = normalizeIdList(eventPayload?.timeSlotIds);
        return timeSlotIds.length
          ? prisma.timeSlots.findMany({ where: { id: { in: timeSlotIds } } })
          : Promise.resolve([]);
      })(),
      (() => {
        const scoringConfigId = normalizeId(eventPayload?.leagueScoringConfigId);
        return scoringConfigId
          ? prisma.leagueScoringConfigs.findUnique({ where: { id: scoringConfigId } })
          : Promise.resolve(null);
      })(),
    ]);

    const matches = Object.values(eventWithRelations.matches)
      .sort((left, right) => matchStartTime(left) - matchStartTime(right));
    const fieldIds = normalizeIdList(eventPayload?.fieldIds);
    const timeSlotIds = normalizeIdList(eventPayload?.timeSlotIds);

    let teamCompliance: any = null;
    let userCompliance: any = null;
    if (req.nextUrl.searchParams.get('manage') === 'true') {
      const complianceResponse = eventPayload?.teamSignup
        ? await getTeamCompliance(req, { params: routeParams() })
        : await getUserCompliance(req, { params: routeParams() });
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

    return NextResponse.json({
      event: eventPayload,
      participantSnapshot: participantPayload,
      matches: serializeMatchesLegacy(matches),
      fields: orderByIds(fieldIds, fieldRows).map((field) => withLegacyFields(field)),
      timeSlots: orderByIds(timeSlotIds, timeSlotRows).map((slot) => withLegacyFields(slot)),
      leagueScoringConfig: leagueScoringConfig ? withLegacyFields(leagueScoringConfig) : null,
      staffInvites: Array.isArray(eventPayload?.staffInvites) ? eventPayload.staffInvites : [],
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
