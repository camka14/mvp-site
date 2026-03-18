import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

type ParsedArgs = {
  apply: boolean;
};

type TeamProjection = {
  id: string;
  captainId: string;
  parentTeamId: string | null;
};

const getTeamsDelegate = (client: any) => client?.teams ?? client?.volleyBallTeams;

const parseArgs = (argv: string[]): ParsedArgs => {
  const hasApply = argv.includes('--apply');
  const hasDryRun = argv.includes('--dry-run');
  if (hasApply && hasDryRun) {
    throw new Error('Use either --apply or --dry-run, not both.');
  }
  return { apply: hasApply };
};

const normalizeId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const normalizeIdList = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const next: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    const normalized = normalizeId(entry);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    next.push(normalized);
  }
  return next;
};

const arraysEqual = (left: string[], right: string[]): boolean => {
  if (left.length !== right.length) {
    return false;
  }
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) {
      return false;
    }
  }
  return true;
};

const resolveCanonicalTeamId = (team: TeamProjection): string | null => {
  const normalizedParentTeamId = normalizeId(team.parentTeamId);
  if (normalizedParentTeamId) {
    return normalizedParentTeamId;
  }
  const normalizedCaptainId = normalizeId(team.captainId);
  if (!normalizedCaptainId) {
    return null;
  }
  return team.id;
};

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const teamsDelegate = getTeamsDelegate(prisma);
  if (!teamsDelegate?.findMany) {
    throw new Error('Team storage is unavailable. Regenerate Prisma client.');
  }

  const users = await prisma.userData.findMany({
    select: {
      id: true,
      teamIds: true,
    },
  });

  const referencedTeamIds = normalizeIdList(users.flatMap((user) => normalizeIdList(user.teamIds)));
  if (!referencedTeamIds.length) {
    console.log('No user teamIds found. Nothing to clean.');
    return;
  }

  const teams: TeamProjection[] = await teamsDelegate.findMany({
    where: { id: { in: referencedTeamIds } },
    select: {
      id: true,
      captainId: true,
      parentTeamId: true,
    },
  });
  const canonicalByTeamId = new Map<string, string | null>();
  teams.forEach((team) => {
    canonicalByTeamId.set(team.id, resolveCanonicalTeamId(team));
  });

  const updates: Array<{ userId: string; before: string[]; after: string[] }> = [];
  users.forEach((user) => {
    const before = normalizeIdList(user.teamIds);
    if (!before.length) {
      return;
    }
    const after: string[] = [];
    const seen = new Set<string>();
    for (const teamId of before) {
      const mapped = canonicalByTeamId.has(teamId) ? canonicalByTeamId.get(teamId) : teamId;
      if (!mapped || seen.has(mapped)) {
        continue;
      }
      seen.add(mapped);
      after.push(mapped);
    }
    if (!arraysEqual(before, after)) {
      updates.push({ userId: user.id, before, after });
    }
  });

  console.log(`Users scanned: ${users.length}`);
  console.log(`Users needing update: ${updates.length}`);

  if (!updates.length) {
    console.log('No changes required.');
    return;
  }

  if (!args.apply) {
    console.log('Dry run. Re-run with --apply to persist changes.');
    updates.slice(0, 20).forEach((row) => {
      console.log(`${row.userId}: [${row.before.join(', ')}] -> [${row.after.join(', ')}]`);
    });
    if (updates.length > 20) {
      console.log(`... ${updates.length - 20} more`);
    }
    return;
  }

  for (const row of updates) {
    await prisma.userData.update({
      where: { id: row.userId },
      data: {
        teamIds: row.after,
        updatedAt: new Date(),
      },
    });
  }

  console.log(`Applied updates to ${updates.length} users.`);
}

main()
  .catch((error) => {
    console.error('[cleanup-user-teamids-canonical] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
