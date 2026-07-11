import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import { syncTeamChatByTeamId } from '../src/server/teamChatSync';

type ParsedArgs = {
  apply: boolean;
  limit?: number;
};

const TEAM_CHAT_GROUP_ID_PREFIX = 'team:';

const parseArgs = (argv: string[]): ParsedArgs => {
  const hasApply = argv.includes('--apply');
  const hasDryRun = argv.includes('--dry-run');
  if (hasApply && hasDryRun) {
    throw new Error('Use either --apply or --dry-run, not both.');
  }

  const limitArgument = argv.find((argument) => argument.startsWith('--limit='));
  const limit = limitArgument ? Number(limitArgument.slice('--limit='.length)) : undefined;
  if (limit !== undefined && (!Number.isFinite(limit) || limit < 1)) {
    throw new Error('--limit must be a positive number.');
  }

  return { apply: hasApply, limit: limit === undefined ? undefined : Math.trunc(limit) };
};

const getTeamId = (group: { id: string; teamId: string | null }): string | null => {
  const explicitTeamId = group.teamId?.trim();
  if (explicitTeamId) {
    return explicitTeamId;
  }

  if (!group.id.toLowerCase().startsWith(TEAM_CHAT_GROUP_ID_PREFIX)) {
    return null;
  }

  const teamIdFromGroupId = group.id.slice(TEAM_CHAT_GROUP_ID_PREFIX.length).trim();
  return teamIdFromGroupId || null;
};

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const groups = await prisma.chatGroup.findMany({
    where: {
      OR: [
        { teamId: { not: null } },
        { id: { startsWith: TEAM_CHAT_GROUP_ID_PREFIX } },
      ],
    },
    select: { id: true, teamId: true },
    orderBy: { id: 'asc' },
    ...(args.limit ? { take: args.limit } : {}),
  });

  const teamIds = Array.from(new Set(groups
    .map(getTeamId)
    .filter((teamId): teamId is string => Boolean(teamId))));

  console.log(`Team chat rows scanned: ${groups.length}`);
  console.log(`Teams to reconcile: ${teamIds.length}`);

  if (!args.apply) {
    console.log('Dry run. Re-run with --apply to synchronize roster-derived membership and clear adopted legacy messages.');
    teamIds.slice(0, 20).forEach((teamId) => console.log(`would reconcile ${teamId}`));
    if (teamIds.length > 20) {
      console.log(`... ${teamIds.length - 20} more`);
    }
    return;
  }

  for (const teamId of teamIds) {
    await syncTeamChatByTeamId(teamId);
  }

  console.log(`Reconciled ${teamIds.length} team chats.`);
}

main()
  .catch((error) => {
    console.error('[reconcile-team-chats] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
