import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL missing');

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const eventMatches = await prisma.events.findMany({
      where: { name: { contains: 'Test League', mode: 'insensitive' } },
      select: {
        id: true,
        name: true,
        teamIds: true,
        freeAgentIds: true,
        waitListIds: true,
        eventType: true,
        state: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    const teamMatches = await prisma.teams.findMany({
      where: { name: { contains: 'Test League Team 08', mode: 'insensitive' } },
      select: {
        id: true,
        name: true,
        playerIds: true,
        captainId: true,
        managerId: true,
        division: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    console.log(JSON.stringify({ eventMatches, teamMatches }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
