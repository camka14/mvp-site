import {
  applyDivisionPhaseRulesToMatch,
  resolveScheduledMatchDurationMs,
} from '@/server/scheduler/divisionPhaseRules';
import { Division, Match, Tournament } from '@/server/scheduler/types';
import { resolveMatchRules } from '@/server/matches/matchOperations';

const buildEvent = (division: Division) => new Tournament({
  id: 'event_1',
  name: 'Event',
  start: new Date('2026-08-03T16:00:00.000Z'),
  end: new Date('2026-08-04T02:00:00.000Z'),
  maxParticipants: 8,
  teamSignup: true,
  eventType: 'LEAGUE',
  divisions: [division],
  usesSets: false,
  matchDurationMinutes: 60,
  resolvedMatchRules: resolveMatchRules({
    sportTemplate: {
      scoringModel: 'PERIODS',
      segmentCount: 2,
      segmentLabel: 'Half',
      timekeeping: { timerMode: 'COUNT_UP', segmentDurationMinutes: 45 },
    },
  }),
});

const buildMatch = (division: Division) => new Match({
  id: 'match_1',
  start: new Date('2026-08-03T16:00:00.000Z'),
  end: new Date('2026-08-03T17:00:00.000Z'),
  division,
  bufferMs: 0,
  eventId: 'event_1',
});

describe('division phase scheduler rules', () => {
  it('uses segment count, length, and breaks for timed match duration', () => {
    const division = new Division(
      'open',
      'Open',
      [],
      null,
      8,
      null,
      'LEAGUE',
      [],
      null,
      null,
      null,
      null,
      [],
      null,
      {
        LEAGUE: {
          matchRulesOverride: { segmentCount: 4, segmentLabel: 'Quarter' },
          segmentLengthMinutes: 12,
          segmentBreakMinutes: 2,
        },
      },
    );
    const event = buildEvent(division);
    const match = buildMatch(division);

    expect(resolveScheduledMatchDurationMs(event, match, 60 * 60 * 1000)).toBe(54 * 60 * 1000);
    expect(match.matchRulesSnapshot).toEqual(expect.objectContaining({
      segmentCount: 4,
      segmentLabel: 'Quarter',
    }));
  });

  it('does not replace an existing match rules snapshot', () => {
    const division = new Division('open', 'Open');
    const event = buildEvent(division);
    const match = buildMatch(division);
    const snapshot = resolveMatchRules({
      sportTemplate: { scoringModel: 'PERIODS', segmentCount: 2 },
    });
    match.matchRulesSnapshot = snapshot;

    applyDivisionPhaseRulesToMatch(event, match);

    expect(match.matchRulesSnapshot).toBe(snapshot);
  });

  it('uses playoff settings for bracket-linked matches inside a league', () => {
    const division = new Division(
      'open',
      'Open',
      [],
      null,
      8,
      null,
      'LEAGUE',
      [],
      null,
      null,
      null,
      null,
      [],
      null,
      {
        BRACKET: { matchRulesOverride: { segmentCount: 4 } },
        PLAYOFF: {
          matchRulesOverride: { segmentCount: 3 },
          segmentLengthMinutes: 15,
          segmentBreakMinutes: 5,
        },
      },
    );
    const event = buildEvent(division);
    const match = buildMatch(division);
    match.winnerNextMatch = buildMatch(division);

    expect(resolveScheduledMatchDurationMs(event, match, 60 * 60 * 1000)).toBe(55 * 60 * 1000);
    expect(match.matchRulesSnapshot).toEqual(expect.objectContaining({ segmentCount: 3 }));
  });
});
