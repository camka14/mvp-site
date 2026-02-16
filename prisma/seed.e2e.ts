import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hashPassword } from '../src/lib/authServer';
import {
  SEED_DIVISION,
  SEED_END,
  SEED_EVENTS,
  SEED_FIELD,
  SEED_IMAGE,
  SEED_ORG,
  SEED_RENTAL_SLOT,
  SEED_SPORT,
  SEED_START,
  SEED_TEAM_IDS,
  SEED_USERS,
} from '../e2e/fixtures/seed-data';

const projectRoot = path.resolve(__dirname, '..');

const ensureSeedGuard = (): void => {
  const guardEnabled = ['1', 'true', 'yes'].includes(String(process.env.E2E_SEED || '').toLowerCase());
  const dbUrl = process.env.DATABASE_URL || '';
  const looksLikeE2E = dbUrl.includes('_e2e') || dbUrl.includes('e2e');
  if (!guardEnabled && !looksLikeE2E) {
    throw new Error(
      'Refusing to run E2E seed without E2E_SEED=1 or an e2e DATABASE_URL. Set E2E_SEED=1 to proceed.',
    );
  }
};

const resetDatabase = (): void => {
  execSync('npx prisma db push --force-reset', {
    cwd: projectRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      E2E_SEED: process.env.E2E_SEED ?? '1',
    },
  });

  execSync('npx prisma generate', {
    cwd: projectRoot,
    stdio: 'inherit',
  });
};

const ensureSeedImage = async (): Promise<{ path: string; sizeBytes: number }> => {
  const uploadsRoot = path.join(projectRoot, 'uploads');
  await fs.mkdir(uploadsRoot, { recursive: true });
  const targetPath = path.join(uploadsRoot, SEED_IMAGE.filename);
  const pngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAAWgmWQ0AAAAASUVORK5CYII=';
  const buffer = Buffer.from(pngBase64, 'base64');
  await fs.writeFile(targetPath, buffer);
  return { path: SEED_IMAGE.filename, sizeBytes: buffer.length };
};

const seed = async (): Promise<void> => {
  ensureSeedGuard();
  resetDatabase();

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }
  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });
  try {
    const now = new Date();
    const hostPasswordHash = await hashPassword(SEED_USERS.host.password);
    const participantPasswordHash = await hashPassword(SEED_USERS.participant.password);

    const seedImage = await ensureSeedImage();

    await prisma.authUser.createMany({
      data: [
        {
          id: SEED_USERS.host.id,
          email: SEED_USERS.host.email.toLowerCase(),
          passwordHash: hostPasswordHash,
          name: `${SEED_USERS.host.firstName} ${SEED_USERS.host.lastName}`,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: SEED_USERS.participant.id,
          email: SEED_USERS.participant.email.toLowerCase(),
          passwordHash: participantPasswordHash,
          name: `${SEED_USERS.participant.firstName} ${SEED_USERS.participant.lastName}`,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });

    await prisma.userData.createMany({
      data: [
        {
          id: SEED_USERS.host.id,
          firstName: SEED_USERS.host.firstName,
          lastName: SEED_USERS.host.lastName,
          userName: SEED_USERS.host.userName,
          dateOfBirth: new Date('1990-01-01T00:00:00Z'),
          hasStripeAccount: true,
          uploadedImages: [SEED_IMAGE.id],
          createdAt: now,
          updatedAt: now,
        },
        {
          id: SEED_USERS.participant.id,
          firstName: SEED_USERS.participant.firstName,
          lastName: SEED_USERS.participant.lastName,
          userName: SEED_USERS.participant.userName,
          dateOfBirth: new Date('2000-01-01T00:00:00Z'),
          uploadedImages: [],
          createdAt: now,
          updatedAt: now,
        },
      ],
    });

    await prisma.file.create({
      data: {
        id: SEED_IMAGE.id,
        uploaderId: SEED_USERS.host.id,
        organizationId: SEED_ORG.id,
        bucket: null,
        originalName: SEED_IMAGE.filename,
        mimeType: SEED_IMAGE.mimeType,
        sizeBytes: seedImage.sizeBytes,
        path: seedImage.path,
        createdAt: now,
        updatedAt: now,
      },
    });

    await prisma.divisions.create({
      data: {
        id: SEED_DIVISION.id,
        name: SEED_DIVISION.name,
        createdAt: now,
        updatedAt: now,
      },
    });

    await prisma.sports.create({
      data: {
        id: SEED_SPORT.id,
        name: SEED_SPORT.name,
        createdAt: now,
        updatedAt: now,
      },
    });

    await prisma.organizations.create({
      data: {
        id: SEED_ORG.id,
        name: SEED_ORG.name,
        location: SEED_ORG.location,
        ownerId: SEED_ORG.ownerId,
        hasStripeAccount: SEED_ORG.hasStripeAccount,
        coordinates: SEED_ORG.coordinates,
        fieldIds: [SEED_FIELD.id],
        productIds: [],
        refIds: [],
        teamIds: [],
        createdAt: now,
        updatedAt: now,
      },
    });

    await prisma.fields.create({
      data: {
        id: SEED_FIELD.id,
        fieldNumber: SEED_FIELD.fieldNumber,
        divisions: [...SEED_FIELD.divisions],
        lat: SEED_FIELD.lat,
        long: SEED_FIELD.long,
        name: SEED_FIELD.name,
        location: SEED_FIELD.location,
        organizationId: SEED_ORG.id,
        rentalSlotIds: [SEED_RENTAL_SLOT.id],
        createdAt: now,
        updatedAt: now,
      },
    });

    await prisma.timeSlots.create({
      data: {
        id: SEED_RENTAL_SLOT.id,
        scheduledFieldId: SEED_RENTAL_SLOT.scheduledFieldId,
        price: SEED_RENTAL_SLOT.price,
        repeating: SEED_RENTAL_SLOT.repeating,
        dayOfWeek: SEED_RENTAL_SLOT.dayOfWeek,
        startDate: new Date(SEED_RENTAL_SLOT.startDate),
        endDate: new Date(SEED_RENTAL_SLOT.endDate),
        startTimeMinutes: SEED_RENTAL_SLOT.startTimeMinutes,
        endTimeMinutes: SEED_RENTAL_SLOT.endTimeMinutes,
        createdAt: now,
        updatedAt: now,
      },
    });

    const baseEventData = {
      start: new Date(SEED_START),
      end: new Date(SEED_END),
      description: 'Seeded event for E2E tests',
      divisions: [SEED_DIVISION.id],
      location: SEED_ORG.location,
      rating: 5,
      teamSizeLimit: 6,
      maxParticipants: 12,
      hostId: SEED_USERS.host.id,
      singleDivision: true,
      waitListIds: [],
      freeAgentIds: [],
      cancellationRefundHours: 24,
      teamSignup: false,
      registrationCutoffHours: 2,
      seedColor: 0,
      imageId: SEED_IMAGE.id,
      coordinates: SEED_ORG.coordinates,
      fieldIds: [SEED_FIELD.id],
      timeSlotIds: [SEED_RENTAL_SLOT.id],
      teamIds: [],
      userIds: [],
      registrationIds: [],
      leagueScoringConfigId: null,
      sportId: SEED_SPORT.id,
      organizationId: SEED_ORG.id,
      autoCancellation: false,
      eventType: 'EVENT' as const,
      refereeIds: [],
      allowPaymentPlans: false,
      installmentCount: 0,
      installmentDueDates: [],
      installmentAmounts: [],
      allowTeamSplitDefault: false,
      requiredTemplateIds: [],
      createdAt: now,
      updatedAt: now,
    };

    await prisma.events.createMany({
      data: [
        {
          ...baseEventData,
          id: SEED_EVENTS.free.id,
          name: SEED_EVENTS.free.name,
          price: SEED_EVENTS.free.price,
          state: 'PUBLISHED',
        },
        {
          ...baseEventData,
          id: SEED_EVENTS.paid.id,
          name: SEED_EVENTS.paid.name,
          price: SEED_EVENTS.paid.price,
          state: 'PUBLISHED',
        },
      ],
    });

    await prisma.volleyBallTeams.createMany({
      data: SEED_TEAM_IDS.map((id, index) => ({
        id,
        seed: index + 1,
        playerIds: [],
        division: SEED_DIVISION.id,
        wins: 0,
        losses: 0,
        name: `Team ${index + 1}`,
        captainId: SEED_USERS.host.id,
        pending: [],
        teamSize: 6,
        profileImageId: null,
        sport: 'Volleyball',
        createdAt: now,
        updatedAt: now,
      })),
    });

    await prisma.events.createMany({
      data: [
        {
          ...baseEventData,
          id: SEED_EVENTS.scheduler.tournament8.id,
          name: SEED_EVENTS.scheduler.tournament8.name,
          eventType: 'TOURNAMENT',
          teamIds: SEED_TEAM_IDS.slice(0, 8),
          price: 0,
          state: 'PUBLISHED',
          winnerSetCount: 2,
          loserSetCount: 1,
          winnerBracketPointsToVictory: [21],
          loserBracketPointsToVictory: [15],
          doubleElimination: false,
          fieldCount: 1,
        },
        {
          ...baseEventData,
          id: SEED_EVENTS.scheduler.tournament6.id,
          name: SEED_EVENTS.scheduler.tournament6.name,
          eventType: 'TOURNAMENT',
          teamIds: SEED_TEAM_IDS.slice(0, 6),
          price: 0,
          state: 'PUBLISHED',
          winnerSetCount: 2,
          loserSetCount: 1,
          winnerBracketPointsToVictory: [21],
          loserBracketPointsToVictory: [15],
          doubleElimination: false,
          fieldCount: 1,
        },
        {
          ...baseEventData,
          id: SEED_EVENTS.scheduler.tournamentDoubleElim.id,
          name: SEED_EVENTS.scheduler.tournamentDoubleElim.name,
          eventType: 'TOURNAMENT',
          teamIds: SEED_TEAM_IDS.slice(0, 8),
          price: 0,
          state: 'PUBLISHED',
          winnerSetCount: 2,
          loserSetCount: 1,
          winnerBracketPointsToVictory: [21],
          loserBracketPointsToVictory: [15],
          doubleElimination: true,
          fieldCount: 1,
        },
        {
          ...baseEventData,
          id: SEED_EVENTS.scheduler.leagueNoSlots.id,
          name: SEED_EVENTS.scheduler.leagueNoSlots.name,
          eventType: 'LEAGUE',
          teamIds: SEED_TEAM_IDS.slice(0, 4),
          timeSlotIds: [],
          gamesPerOpponent: 1,
          includePlayoffs: false,
          price: 0,
          state: 'PUBLISHED',
        },
        {
          ...baseEventData,
          id: SEED_EVENTS.scheduler.leagueSameDay.id,
          name: SEED_EVENTS.scheduler.leagueSameDay.name,
          eventType: 'LEAGUE',
          teamIds: SEED_TEAM_IDS.slice(0, 4),
          start: new Date('2026-04-01T10:00:00Z'),
          end: new Date('2026-04-01T10:00:00Z'),
          timeSlotIds: [SEED_RENTAL_SLOT.id],
          gamesPerOpponent: 1,
          includePlayoffs: false,
          price: 0,
          state: 'PUBLISHED',
        },
      ],
    });
  } finally {
    await prisma.$disconnect();
  }
};

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
