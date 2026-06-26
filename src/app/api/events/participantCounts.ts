import { getEventParticipantAggregates } from '@/server/events/eventRegistrations';
import { inferAffiliateParticipantAvailability } from '@/server/affiliateImports/participantAvailability';

type EventRowForParticipants = {
  id: string;
  eventType?: string | null;
  parentEvent?: string | null;
  teamSignup?: boolean | null;
  singleDivision?: boolean | null;
  maxParticipants?: number | null;
  sourceType?: string | null;
  statusText?: string | null;
  divisions?: unknown;
};

export const withEventAttendeeCounts = async <T extends EventRowForParticipants>(
  events: T[],
): Promise<Array<T & {
  attendees: number;
  participantCount: number | null;
  participantCapacity: number | null;
}>> => {
  const aggregates = await getEventParticipantAggregates(events);
  return events.map((event) => {
    const aggregate = aggregates.get(event.id) ?? {
      participantCount: 0,
      participantCapacity: null,
    };
    const isAffiliateEvent = String(event.sourceType ?? '').toUpperCase() === 'AFFILIATE_IMPORT';
    const sourceAvailability = isAffiliateEvent
      ? inferAffiliateParticipantAvailability({
          maxParticipants: event.maxParticipants,
          spotsRemainingText: event.statusText,
          statusText: event.statusText,
        })
      : null;
    const participantCount = sourceAvailability?.currentParticipants ?? aggregate.participantCount;
    const participantCapacity = sourceAvailability?.maxParticipants ?? aggregate.participantCapacity;
    return {
      ...event,
      attendees: participantCount ?? 0,
      participantCount,
      participantCapacity,
    };
  });
};
