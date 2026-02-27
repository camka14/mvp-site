import { prisma } from '../src/lib/prisma';
import { loadEventWithRelations } from '../src/server/repositories/events';
import { rescheduleEventMatchesPreservingLocks } from '../src/server/scheduler/reschedulePreservingLocks';

const id = 'e7c5bb6f-1529-46c3-ab2b-9d35d135427d';

const isCompleted = (match: any): boolean => {
  const results = Array.isArray(match.setResults) ? match.setResults : [];
  if (!results.length) return false;
  const team1Wins = results.filter((value: number) => value === 1).length;
  const team2Wins = results.filter((value: number) => value === 2).length;
  const setsToWin = Math.ceil(results.length / 2);
  return team1Wins >= setsToWin || team2Wins >= setsToWin;
};

const hasBracketDeps = (match: any): boolean => Boolean(
  match.previousLeftMatch || match.previousRightMatch || match.winnerNextMatch || match.loserNextMatch,
);

const run = async () => {
  const event = await loadEventWithRelations(id, prisma as any);
  const matches = Object.values(event.matches);
  console.log('total', matches.length, 'completed', matches.filter(isCompleted).length, 'deps', matches.filter(hasBracketDeps).length, 'locked', matches.filter((m: any) => m.locked).length);

  for (const match of matches) {
    if (!match.locked && isCompleted(match)) {
      match.locked = true;
    }
  }

  console.log('locked after temp lock', matches.filter((m: any) => m.locked).length);

  try {
    const result = rescheduleEventMatchesPreservingLocks(event as any);
    console.log('OK', result.matches.length, 'warnings', result.warnings.length);
  } catch (error) {
    console.error('FAILED', error instanceof Error ? error.message : error);
  } finally {
    await prisma.$disconnect();
  }
};

void run();
