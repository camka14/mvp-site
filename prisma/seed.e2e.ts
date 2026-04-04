import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hashPassword } from '../src/lib/authServer';
import {
  SEED_CAMKA,
  SEED_DEV_USERS,
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
const uploadsRoot = path.join(projectRoot, 'uploads');
const CAMKA_UPLOAD_ID_PREFIX = 'camka_upload_';
const IMAGE_MIME_TYPES = new Map<string, string>([
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
  ['.gif', 'image/gif'],
]);
const seedUserEmails = [SEED_USERS.host.email, SEED_USERS.participant.email, ...SEED_DEV_USERS.map((user) => user.email)].map(
  (email) => email.toLowerCase(),
);
const seedUserIds = [SEED_USERS.host.id, SEED_USERS.participant.id, ...SEED_DEV_USERS.map((user) => user.id)];
const seedUserNames = [SEED_USERS.host.userName, SEED_USERS.participant.userName, ...SEED_DEV_USERS.map((user) => user.userName)];

const truthyEnv = (value: string | undefined): boolean =>
  ['1', 'true', 'yes'].includes(String(value || '').toLowerCase());

const unique = <T>(values: readonly T[]): T[] => Array.from(new Set(values));

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const getMimeType = (filename: string): string | null => IMAGE_MIME_TYPES.get(path.extname(filename).toLowerCase()) ?? null;

type UploadImageFile = {
  id: string;
  originalName: string;
  mimeType: string | null;
  path: string;
  sizeBytes: number;
};

const ensureSeedGuard = (): void => {
  const guardEnabled = truthyEnv(process.env.E2E_SEED);
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

const shouldSkipReset = (): boolean => truthyEnv(process.env.SEED_SKIP_RESET);

const clearSeedRecords = async (prisma: PrismaClient): Promise<void> => {
  const seedEventIds = [
    SEED_EVENTS.free.id,
    SEED_EVENTS.paid.id,
    SEED_EVENTS.scheduler.tournament8.id,
    SEED_EVENTS.scheduler.tournament6.id,
    SEED_EVENTS.scheduler.tournamentDoubleElim.id,
    SEED_EVENTS.scheduler.leagueNoSlots.id,
    SEED_EVENTS.scheduler.leagueSameDay.id,
  ];
  await prisma.events.deleteMany({ where: { id: { in: seedEventIds } } });
  await prisma.teams.deleteMany({ where: { id: { in: [...SEED_TEAM_IDS] } } });
  await prisma.timeSlots.deleteMany({ where: { id: SEED_RENTAL_SLOT.id } });
  await prisma.fields.deleteMany({ where: { id: SEED_FIELD.id } });
  await prisma.organizations.deleteMany({ where: { id: SEED_ORG.id } });
  await prisma.sports.deleteMany({ where: { id: SEED_SPORT.id } });
  await prisma.divisions.deleteMany({ where: { id: SEED_DIVISION.id } });
  await prisma.file.deleteMany({ where: { id: SEED_IMAGE.id } });
  await prisma.file.deleteMany({ where: { id: { startsWith: CAMKA_UPLOAD_ID_PREFIX } } });
  await prisma.sensitiveUserData.deleteMany({
    where: {
      OR: [
        { id: { in: seedUserIds } },
        { userId: { in: seedUserIds } },
        { email: { in: seedUserEmails } },
      ],
    },
  });
  await prisma.userData.deleteMany({
    where: {
      OR: [
        { id: { in: seedUserIds } },
        { userName: { in: seedUserNames } },
      ],
    },
  });
  await prisma.authUser.deleteMany({
    where: {
      OR: [
        { id: { in: seedUserIds } },
        { email: { in: seedUserEmails } },
      ],
    },
  });
};

const ensureSeedImage = async (): Promise<{ path: string; sizeBytes: number }> => {
  await fs.mkdir(uploadsRoot, { recursive: true });
  const targetPath = path.join(uploadsRoot, SEED_IMAGE.filename);
  const pngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAAWgmWQ0AAAAASUVORK5CYII=';
  const buffer = Buffer.from(pngBase64, 'base64');
  await fs.writeFile(targetPath, buffer);
  return { path: SEED_IMAGE.filename, sizeBytes: buffer.length };
};

const listUploadImages = async (): Promise<UploadImageFile[]> => {
  await fs.mkdir(uploadsRoot, { recursive: true });
  const entries = await fs.readdir(uploadsRoot, { withFileTypes: true });
  const files: UploadImageFile[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    const mimeType = getMimeType(entry.name);
    if (!mimeType) {
      continue;
    }

    const stats = await fs.stat(path.join(uploadsRoot, entry.name));
    files.push({
      id: `${CAMKA_UPLOAD_ID_PREFIX}${slugify(entry.name)}`,
      originalName: entry.name,
      mimeType,
      path: entry.name,
      sizeBytes: stats.size,
    });
  }

  return files.sort((left, right) => left.originalName.localeCompare(right.originalName));
};

const buildSeedUsers = () => [SEED_USERS.host, SEED_USERS.participant, ...SEED_DEV_USERS];

const createSensitiveUserRows = (now: Date) =>
  buildSeedUsers().map((user) => ({
    id: user.id,
    userId: user.id,
    email: user.email.toLowerCase(),
    createdAt: now,
    updatedAt: now,
  }));

const ensureCamkaUploads = async (prisma: PrismaClient, now: Date): Promise<void> => {
  const existingCamka = await prisma.userData.findFirst({
    where: { userName: { equals: SEED_CAMKA.userName, mode: 'insensitive' } },
  });
  const camkaId = existingCamka?.id ?? SEED_CAMKA.id;
  const [existingAuth, existingSensitive, uploadFiles] = await Promise.all([
    prisma.authUser.findUnique({ where: { id: camkaId } }),
    prisma.sensitiveUserData.findUnique({ where: { id: camkaId } }),
    listUploadImages(),
  ]);

  const firstName = existingCamka?.firstName ?? SEED_CAMKA.firstName;
  const lastName = existingCamka?.lastName ?? SEED_CAMKA.lastName;
  const displayName = [firstName, lastName].filter(Boolean).join(' ') || SEED_CAMKA.userName;
  const email = (existingAuth?.email ?? existingSensitive?.email ?? SEED_CAMKA.email).toLowerCase();
  const preservedUploadIds = (existingCamka?.uploadedImages ?? []).filter((id) => !id.startsWith(CAMKA_UPLOAD_ID_PREFIX));
  const camkaUploadIds = uploadFiles.map((file) => file.id);

  if (!existingAuth) {
    const passwordHash = await hashPassword(SEED_CAMKA.password);
    await prisma.authUser.create({
      data: {
        id: camkaId,
        email,
        passwordHash,
        name: displayName,
        emailVerifiedAt: now,
        createdAt: now,
        updatedAt: now,
        lastLogin: now,
      },
    });
  } else {
    await prisma.authUser.update({
      where: { id: camkaId },
      data: {
        email,
        name: displayName,
        emailVerifiedAt: (existingAuth as { emailVerifiedAt?: Date | null } | null)?.emailVerifiedAt ?? now,
        updatedAt: now,
      },
    });
  }

  await prisma.sensitiveUserData.upsert({
    where: { id: camkaId },
    update: {
      userId: camkaId,
      email,
      updatedAt: now,
    },
    create: {
      id: camkaId,
      userId: camkaId,
      email,
      createdAt: now,
      updatedAt: now,
    },
  });

  await prisma.userData.upsert({
    where: { id: camkaId },
    update: {
      firstName,
      lastName,
      userName: SEED_CAMKA.userName,
      dateOfBirth: existingCamka?.dateOfBirth ?? new Date('1990-01-01T00:00:00Z'),
      hasStripeAccount: existingCamka?.hasStripeAccount ?? false,
      teamIds: existingCamka?.teamIds ?? [],
      friendIds: existingCamka?.friendIds ?? [],
      followingIds: existingCamka?.followingIds ?? [],
      friendRequestIds: existingCamka?.friendRequestIds ?? [],
      friendRequestSentIds: existingCamka?.friendRequestSentIds ?? [],
      profileImageId: existingCamka?.profileImageId ?? null,
      homePageOrganizationId: existingCamka?.homePageOrganizationId ?? null,
      uploadedImages: unique([...preservedUploadIds, ...camkaUploadIds]),
      updatedAt: now,
    },
    create: {
      id: camkaId,
      firstName,
      lastName,
      userName: SEED_CAMKA.userName,
      dateOfBirth: new Date('1990-01-01T00:00:00Z'),
      hasStripeAccount: false,
      teamIds: [],
      friendIds: [],
      followingIds: [],
      friendRequestIds: [],
      friendRequestSentIds: [],
      uploadedImages: camkaUploadIds,
      profileImageId: null,
      createdAt: now,
      updatedAt: now,
    },
  });

  if (uploadFiles.length > 0) {
    await prisma.file.createMany({
      data: uploadFiles.map((file) => ({
        id: file.id,
        uploaderId: camkaId,
        organizationId: null,
        bucket: null,
        originalName: file.originalName,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        path: file.path,
        createdAt: now,
        updatedAt: now,
      })),
    });
  }
};

const seed = async (): Promise<void> => {
  ensureSeedGuard();
  if (!shouldSkipReset()) {
    resetDatabase();
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }
  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });
  try {
    const now = new Date();
    await clearSeedRecords(prisma);

    const seedUsers = buildSeedUsers();
    const passwordHashes = new Map(
      await Promise.all(seedUsers.map(async (user) => [user.id, await hashPassword(user.password)] as const)),
    );

    const seedImage = await ensureSeedImage();

    await prisma.authUser.createMany({
      data: seedUsers.map((user) => ({
        id: user.id,
        email: user.email.toLowerCase(),
        passwordHash: passwordHashes.get(user.id) ?? '',
        name: `${user.firstName} ${user.lastName}`,
        emailVerifiedAt: now,
        createdAt: now,
        updatedAt: now,
        lastLogin: now,
      })),
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
          teamIds: [],
          friendIds: [],
          followingIds: [],
          friendRequestIds: [],
          friendRequestSentIds: [],
          uploadedImages: [SEED_IMAGE.id],
          profileImageId: null,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: SEED_USERS.participant.id,
          firstName: SEED_USERS.participant.firstName,
          lastName: SEED_USERS.participant.lastName,
          userName: SEED_USERS.participant.userName,
          dateOfBirth: new Date('2000-01-01T00:00:00Z'),
          hasStripeAccount: false,
          teamIds: [],
          friendIds: [],
          followingIds: [],
          friendRequestIds: [],
          friendRequestSentIds: [],
          uploadedImages: [],
          profileImageId: null,
          createdAt: now,
          updatedAt: now,
        },
        ...SEED_DEV_USERS.map((user, index) => ({
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          userName: user.userName,
          dateOfBirth: new Date(Date.UTC(1990, 0, index + 1)),
          hasStripeAccount: false,
          teamIds: [],
          friendIds: [],
          followingIds: [],
          friendRequestIds: [],
          friendRequestSentIds: [],
          uploadedImages: [],
          profileImageId: null,
          createdAt: now,
          updatedAt: now,
        })),
      ],
    });

    await prisma.sensitiveUserData.createMany({
      data: createSensitiveUserRows(now),
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

    await ensureCamkaUploads(prisma, now);

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
        productIds: [],
        officialIds: [],
        teamIds: [],
        createdAt: now,
        updatedAt: now,
      },
    });

    await prisma.fields.create({
      data: {
        id: SEED_FIELD.id,
        fieldNumber: SEED_FIELD.fieldNumber,
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
      leagueScoringConfigId: null,
      sportId: SEED_SPORT.id,
      organizationId: SEED_ORG.id,
      autoCancellation: false,
      eventType: 'EVENT' as const,
      officialIds: [],
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

    await prisma.teams.createMany({
      data: SEED_TEAM_IDS.map((id, index) => ({
        id,
        playerIds: [],
        division: SEED_DIVISION.id,
        wins: 0,
        losses: 0,
        name: `Team ${index + 1}`,
        captainId: SEED_USERS.host.id,
        managerId: SEED_USERS.host.id,
        coachIds: [],
        parentTeamId: null,
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
