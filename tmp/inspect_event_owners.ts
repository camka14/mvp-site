import { prisma } from @/lib/prisma;

const ids = [
  898e89f0-68c9-4141-b09d-328e42e24ef3,
  1706436e-fbcd-47db-85d1-af903c4fe71c,
];

async function main() {
  const events = await prisma.events.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      createdAt: true,
      updatedAt: true,
      start: true,
      end: true,
      hostId: true,
      assistantHostIds: true,
      organizationId: true,
      fieldIds: true,
      timeSlotIds: true,
      eventType: true,
      state: true,
      name: true,
    },
    orderBy: { createdAt: asc },
  });

  const orgId = events[0]?.organizationId ?? null;
  const org = orgId
    ? await prisma.organizations.findUnique({
        where: { id: orgId },
        select: {
          id: true,
          ownerId: true,
          hostIds: true,
          officialIds: true,
          name: true,
        },
      })
    : null;

  const staffMembers = orgId
    ? await prisma.staffMembers.findMany({
        where: { organizationId: orgId },
        select: { userId: true, types: true, createdAt: true, updatedAt: true },
      })
    : [];

  const invites = orgId
    ? await prisma.invites.findMany({
        where: { organizationId: orgId },
        select: {
          id: true,
          userId: true,
          email: true,
          type: true,
          status: true,
          staffTypes: true,
          createdBy: true,
          createdAt: true,
        },
        orderBy: { createdAt: desc },
        take: 50,
      })
    : [];

  const bills = await prisma.bills.findMany({
    where: { eventId: { in: ids } },
    select: {
      id: true,
      eventId: true,
      createdBy: true,
      ownerId: true,
      ownerType: true,
      createdAt: true,
    },
    orderBy: { createdAt: asc },
  });

  const operations = await prisma.boldSignSyncOperations.findMany({
    where: { eventId: { in: ids } },
    select: {
      id: true,
      eventId: true,
      userId: true,
      createdAt: true,
      operationType: true,
    },
    orderBy: { createdAt: asc },
  });

  console.log(JSON.stringify({ events, org, staffMembers, invites, bills, operations }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.();
  });
