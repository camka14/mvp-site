import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const EVENT_ID = '5c9c98f1-a125-4ee5-8591-53f32f366844';
const TEAM_ID = '510b2fa9-98d6-4544-8e6e-19486e1d22d3';

function uniqueIds(ids: string[]): string[] {
  return Array.from(new Set(ids.map((id) => String(id).trim()).filter((id) => id.length > 0)));
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL missing');

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const result = await prisma.$transaction(async (tx) => {
      const event = await tx.events.findUnique({
        where: { id: EVENT_ID },
        select: { id: true, name: true, teamIds: true, freeAgentIds: true },
      });
      if (!event) {
        throw new Error(`Event not found: ${EVENT_ID}`);
      }

      const team = await tx.teams.findUnique({
        where: { id: TEAM_ID },
        select: { id: true, name: true, playerIds: true },
      });
      if (!team) {
        throw new Error(`Team not found: ${TEAM_ID}`);
      }

      const nextTeamIds = event.teamIds.filter((id) => id !== TEAM_ID);
      const nextFreeAgentIds = uniqueIds([...(event.freeAgentIds ?? []), ...(team.playerIds ?? [])]);

      const updated = await tx.events.update({
        where: { id: EVENT_ID },
        data: {
          teamIds: nextTeamIds,
          freeAgentIds: nextFreeAgentIds,
        },
        select: {
          id: true,
          name: true,
          teamIds: true,
          freeAgentIds: true,
        },
      });

      return {
        eventBefore: event,
        team: team,
        eventAfter: updated,
        removedTeamId: TEAM_ID,
        addedFreeAgentCount: team.playerIds.length,
      };
    });

    console.log(JSON.stringify(result, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
