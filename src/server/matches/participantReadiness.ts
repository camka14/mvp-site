import { hasResolvedMatchParticipants } from '@/lib/matchParticipants';

export const MATCH_PARTICIPANTS_REQUIRED_MESSAGE =
  'Both teams must be assigned before officiating can begin.';

export const assertMatchParticipantsReady = (match: unknown): void => {
  if (!hasResolvedMatchParticipants(match)) {
    throw new Response(MATCH_PARTICIPANTS_REQUIRED_MESSAGE, { status: 409 });
  }
};
