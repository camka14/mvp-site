import { getEventParticipantAggregates } from '@/server/events/eventRegistrations';

type EventRowForParticipants = {
  id: string;
  eventType?: string | null;
  parentEvent?: string | null;
  teamSignup?: boolean | null;
  singleDivision?: boolean | null;
  maxParticipants?: number | null;
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
    return {
      ...event,
      attendees: aggregate.participantCount ?? 0,
      participantCount: aggregate.participantCount,
      participantCapacity: aggregate.participantCapacity,
    };
  });
};
