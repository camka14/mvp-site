import { prisma } from '../src/lib/prisma';
import { loadEventWithRelations } from '../src/server/repositories/events';
import { rescheduleEventMatchesPreservingLocks } from '../src/server/scheduler/reschedulePreservingLocks';
import { Schedule } from '../src/server/scheduler/Schedule';

const id = 'e7c5bb6f-1529-46c3-ab2b-9d35d135427d';

const isCompleted = (match: any): boolean => {
  const results = Array.isArray(match.setResults) ? match.setResults : [];
  if (!results.length) return false;
  const team1Wins = results.filter((value: number) => value === 1).length;
  const team2Wins = results.filter((value: number) => value === 2).length;
  const setsToWin = Math.ceil(results.length / 2);
  return team1Wins >= setsToWin || team2Wins >= setsToWin;
};

const originalScheduleEvent = Schedule.prototype.scheduleEvent;
let scheduledCount = 0;

Schedule.prototype.scheduleEvent = function patchedScheduleEvent(event: any, durationMs: number): void {
  try {
    originalScheduleEvent.call(this, event, durationMs);
    scheduledCount += 1;
  } catch (error) {
    const deps = [event.previousLeftMatch?.id, event.previousRightMatch?.id].filter(Boolean);
    console.error('FAILED_MATCH', {
      id: event.id,
      matchId: event.matchId,
      divisionId: event.division?.id,
      team1: event.team1?.id ?? null,
      team2: event.team2?.id ?? null,
      durationMs,
      deps,
      scheduledCount,
    });
    throw error;
  }
};

const run = async () => {
  try {
    const event = await loadEventWithRelations(id, prisma as any);
    const matches = Object.values(event.matches) as any[];

    for (const match of matches) {
      if (!match.locked && isCompleted(match)) {
        match.locked = true;
      }
    }

    const unlocked = matches.filter((m) => !m.locked);
    console.log('unlocked count', unlocked.length);
    console.log('unlocked by division', unlocked.reduce((acc, m) => {
      const key = String(m.division?.id ?? 'unknown');
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>));

    const result = rescheduleEventMatchesPreservingLocks(event as any);
    console.log('SUCCESS', result.matches.length, 'warnings', result.warnings.length);
  } finally {
    Schedule.prototype.scheduleEvent = originalScheduleEvent;
    await prisma.$disconnect();
  }
};

run().catch((error) => {
  console.error('ERROR', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
