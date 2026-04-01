import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

const fieldId = '88d10628-eb56-4f64-a0c5-b7f8f93918e4';
const eventId = '167c3695-7777-432e-a5ba-9eaabb2e872c';

async function main() {
  const field = await prisma.fields.findUnique({
    where: { id: fieldId },
    select: {
      id: true,
      fieldNumber: true,
      name: true,
      organizationId: true,
      rentalSlotIds: true,
      createdAt: true,
      updatedAt: true,
      lat: true,
      long: true,
      heading: true,
      location: true,
    },
  });

  const event = await prisma.events.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      name: true,
      organizationId: true,
      fieldIds: true,
      timeSlotIds: true,
      createdAt: true,
      updatedAt: true,
      parentEvent: true,
      eventType: true,
    },
  });

  const orgFieldsSameName = field?.name ? await prisma.fields.findMany({
    where: {
      name: field.name,
      organizationId: { not: null },
    },
    select: {
      id: true,
      organizationId: true,
      name: true,
      fieldNumber: true,
      rentalSlotIds: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: 'desc' },
    take: 20,
  }) : [];

  const eventsUsingField = await prisma.events.findMany({
    where: {
      fieldIds: { has: fieldId },
    },
    select: {
      id: true,
      name: true,
      organizationId: true,
      start: true,
      end: true,
      eventType: true,
      updatedAt: true,
      createdAt: true,
    },
    orderBy: { updatedAt: 'desc' },
    take: 50,
  });

  console.log(JSON.stringify({ field, event, orgFieldsSameName, eventsUsingField }, null, 2));
}

main();
