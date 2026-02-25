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

const detach = (team: any, match: any) => {
  if (!team?.matches) return;
  team.matches = team.matches.filter((m: any) => m.id !== match.id);
};

const run = async () => {
  const event = await loadEventWithRelations(id, prisma as any);
  const matches = Object.values(event.matches) as any[];

  for (const match of matches) {
    if (!match.locked && isCompleted(match)) {
      match.locked = true;
    }
  }

  for (const match of matches) {
    if (match.locked) continue;
    const deps = match.getDependencies?.() ?? [];
    if (!deps.length) continue;
    const hasPendingDep = deps.some((dep: any) => !isCompleted(dep));
    if (!hasPendingDep) continue;
    detach(match.team1, match);
    detach(match.team2, match);
    detach(match.teamReferee, match);
    match.team1 = null;
    match.team2 = null;
    match.teamReferee = null;
    match.team1Seed = null;
    match.team2Seed = null;
  }

  try {
    const result = rescheduleEventMatchesPreservingLocks(event as any);
    console.log('SUCCESS', result.matches.length, 'warnings', result.warnings.length);
  } catch (error) {
    console.error('FAILED', error instanceof Error ? error.message : error);
  } finally {
    await prisma.$disconnect();
  }
};

void run();
