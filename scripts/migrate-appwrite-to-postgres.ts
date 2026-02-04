/*
  Appwrite -> Postgres migration helper

  Mapping notes (Appwrite collection -> Prisma model):
  - organizations -> organizations
  - userData -> userData
  - volleyBallTeams -> volleyBallTeams
  - events -> events
  - fields -> fields
  - timeSlots -> timeSlots
  - matches -> matches
  - products -> products
  - subscriptions -> subscriptions
  - templateDocuments -> templateDocuments
  - signedDocuments -> signedDocuments
  - chatGroup -> chatGroup
  - messages -> messages
  - bills -> bills
  - refundRequests -> refundRequests
  - eventRegistrations -> eventRegistrations
  - parentChildLinks -> parentChildLinks
  - leagueScoringConfigs -> leagueScoringConfigs
  - sports -> sports
  - invites -> invites

  Usage (exported JSON mode):
    APPWRITE_SOURCE=export APPWRITE_EXPORT_DIR=./appwrite-export \
      npx ts-node scripts/migrate-appwrite-to-postgres.ts

  Usage (REST mode, Appwrite API):
    APPWRITE_SOURCE=rest APPWRITE_ENDPOINT=https://<region>.cloud.appwrite.io/v1 \
    APPWRITE_PROJECT_ID=... APPWRITE_API_KEY=... APPWRITE_DATABASE_ID=... \
    APPWRITE_API_MODE=databases APPWRITE_QUERY_MODE=queries \
      npx ts-node scripts/migrate-appwrite-to-postgres.ts

  Notes:
  - The script uses upsert by id for idempotence.
  - Set MIGRATION_DRY_RUN=true to skip writes.
  - Set MIGRATION_LIMIT to cap records per collection during trial runs.
  - Set MIGRATION_STRICT=false to allow defaults when required fields are missing.
*/

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { prisma } from '../src/lib/prisma';

type RawRow = Record<string, any>;

type CollectionConfig = {
  name: string;
  tableId: string;
  model: string;
  map: (row: RawRow) => Record<string, any> | null;
};

const strict = process.env.MIGRATION_STRICT !== 'false';
const dryRun = process.env.MIGRATION_DRY_RUN === 'true';
const limitOverride = process.env.MIGRATION_LIMIT ? Number(process.env.MIGRATION_LIMIT) : undefined;

const requireString = (value: unknown, label: string, fallback = ''): string => {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }
  if (strict) {
    throw new Error(`Missing required string for ${label}`);
  }
  return fallback;
};

const asString = (value: unknown, fallback = ''): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
};

const asOptionalString = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value;
  return undefined;
};

const asBoolean = (value: unknown, fallback = false): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  if (typeof value === 'number') return value !== 0;
  return fallback;
};

const asNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

const asInt = (value: unknown, fallback = 0): number => Math.trunc(asNumber(value, fallback));

const asStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.filter((item) => typeof item === 'string');
  }
  return [];
};

const asNumberArray = (value: unknown): number[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'number' ? item : Number(item)))
    .filter((item) => Number.isFinite(item));
};

const asDate = (value: unknown): Date | undefined => {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  const parsed = new Date(value as any);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  return undefined;
};

const asDateArray = (value: unknown): Date[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asDate(item))
    .filter((item): item is Date => Boolean(item));
};

const withAuditFields = (row: RawRow, data: Record<string, any>): Record<string, any> => {
  const createdAt = asDate(row.$createdAt ?? row.createdAt);
  const updatedAt = asDate(row.$updatedAt ?? row.updatedAt);
  if (createdAt) data.createdAt = createdAt;
  if (updatedAt) data.updatedAt = updatedAt;
  return data;
};

const normalizePeriod = (value: unknown, fallback: 'WEEK' | 'MONTH' | 'YEAR'): 'WEEK' | 'MONTH' | 'YEAR' => {
  if (typeof value === 'string') {
    const normalized = value.toUpperCase();
    if (normalized.startsWith('WEEK')) return 'WEEK';
    if (normalized.startsWith('MONTH')) return 'MONTH';
    if (normalized.startsWith('YEAR')) return 'YEAR';
  }
  return fallback;
};

const normalizeEnum = <T extends string>(value: unknown, allowed: T[], fallback: T): T => {
  if (typeof value === 'string') {
    const normalized = value.toUpperCase();
    const match = allowed.find((item) => item.toUpperCase() === normalized);
    if (match) return match;
  }
  return fallback;
};

const pickId = (row: RawRow): string => requireString(row.$id ?? row.id, 'id');

const mapOrganization = (row: RawRow): Record<string, any> =>
  withAuditFields(row, {
    id: pickId(row),
    name: requireString(row.name, 'organization.name', 'Organization'),
    location: asOptionalString(row.location),
    description: asOptionalString(row.description),
    logoId: asOptionalString(row.logoId ?? row.logo),
    ownerId: requireString(row.ownerId ?? row.owner, 'organization.ownerId'),
    website: asOptionalString(row.website),
    refIds: asStringArray(row.refIds),
    hasStripeAccount: asBoolean(row.hasStripeAccount),
    coordinates: row.coordinates ?? null,
    fieldIds: asStringArray(row.fieldIds),
    productIds: asStringArray(row.productIds),
    teamIds: asStringArray(row.teamIds),
  });

const mapUserData = (row: RawRow): Record<string, any> => {
  const dateOfBirth = asDate(row.dateOfBirth ?? row.dob ?? row.birthDate) ?? (strict ? undefined : new Date(0));
  if (!dateOfBirth && strict) {
    throw new Error('Missing required userData.dateOfBirth');
  }

  return withAuditFields(row, {
    id: pickId(row),
    firstName: asOptionalString(row.firstName),
    lastName: asOptionalString(row.lastName),
    dateOfBirth: dateOfBirth ?? new Date(0),
    dobVerified: row.dobVerified === undefined ? undefined : asBoolean(row.dobVerified),
    dobVerifiedAt: asDate(row.dobVerifiedAt),
    ageVerificationProvider: asOptionalString(row.ageVerificationProvider),
    teamIds: asStringArray(row.teamIds),
    friendIds: asStringArray(row.friendIds),
    userName: requireString(row.userName ?? row.username, 'userData.userName', pickId(row)),
    hasStripeAccount: row.hasStripeAccount === undefined ? undefined : asBoolean(row.hasStripeAccount),
    followingIds: asStringArray(row.followingIds),
    friendRequestIds: asStringArray(row.friendRequestIds),
    friendRequestSentIds: asStringArray(row.friendRequestSentIds),
    uploadedImages: asStringArray(row.uploadedImages),
    profileImageId: asOptionalString(row.profileImageId ?? row.profileImage),
  });
};

const mapTeam = (row: RawRow): Record<string, any> =>
  withAuditFields(row, {
    id: pickId(row),
    seed: asInt(row.seed, 0),
    playerIds: asStringArray(row.playerIds),
    division: asOptionalString(row.division),
    wins: row.wins === undefined ? undefined : asInt(row.wins),
    losses: row.losses === undefined ? undefined : asInt(row.losses),
    name: asOptionalString(row.name),
    captainId: requireString(row.captainId ?? row.captain, 'team.captainId'),
    pending: asStringArray(row.pending),
    teamSize: asInt(row.teamSize ?? row.maxPlayers, 0),
    profileImageId: asOptionalString(row.profileImageId ?? row.profileImage),
    sport: asOptionalString(row.sport),
  });

const mapField = (row: RawRow): Record<string, any> =>
  withAuditFields(row, {
    id: pickId(row),
    fieldNumber: asInt(row.fieldNumber ?? row.number, 0),
    divisions: asStringArray(row.divisions),
    lat: row.lat === undefined ? undefined : asNumber(row.lat),
    long: row.long === undefined ? undefined : asNumber(row.long),
    heading: row.heading === undefined ? undefined : asNumber(row.heading),
    inUse: row.inUse === undefined ? undefined : asBoolean(row.inUse),
    name: asOptionalString(row.name),
    type: asOptionalString(row.type),
    rentalSlotIds: asStringArray(row.rentalSlotIds),
    location: asOptionalString(row.location),
    organizationId: asOptionalString(row.organizationId),
  });

const mapTimeSlot = (row: RawRow): Record<string, any> => {
  const startDate = asDate(row.startDate ?? row.start) ?? (strict ? undefined : new Date());
  if (!startDate && strict) {
    throw new Error('Missing required timeSlot.startDate');
  }

  return withAuditFields(row, {
    id: pickId(row),
    dayOfWeek: row.dayOfWeek === undefined ? undefined : asInt(row.dayOfWeek),
    startTimeMinutes: row.startTimeMinutes === undefined ? undefined : asInt(row.startTimeMinutes),
    endTimeMinutes: row.endTimeMinutes === undefined ? undefined : asInt(row.endTimeMinutes),
    startDate: startDate ?? new Date(),
    repeating: asBoolean(row.repeating, true),
    endDate: asDate(row.endDate),
    scheduledFieldId: asOptionalString(row.scheduledFieldId ?? row.fieldId),
    price: row.price === undefined ? undefined : asInt(row.price),
  });
};

const mapMatch = (row: RawRow): Record<string, any> =>
  withAuditFields(row, {
    id: pickId(row),
    start: asDate(row.start),
    end: asDate(row.end),
    division: asOptionalString(row.division),
    team1Points: asNumberArray(row.team1Points),
    team2Points: asNumberArray(row.team2Points),
    setResults: asNumberArray(row.setResults),
    side: asOptionalString(row.side),
    matchId: asInt(row.matchId ?? row.matchNumber, 0),
    losersBracket: row.losersBracket === undefined ? undefined : asBoolean(row.losersBracket),
    winnerNextMatchId: asOptionalString(row.winnerNextMatchId),
    loserNextMatchId: asOptionalString(row.loserNextMatchId),
    previousRightId: asOptionalString(row.previousRightId),
    previousLeftId: asOptionalString(row.previousLeftId),
    refereeCheckedIn: row.refereeCheckedIn === undefined ? undefined : asBoolean(row.refereeCheckedIn),
    refereeId: asOptionalString(row.refereeId),
    team1Id: asOptionalString(row.team1Id),
    team2Id: asOptionalString(row.team2Id),
    eventId: asOptionalString(row.eventId),
    fieldId: asOptionalString(row.fieldId),
    teamRefereeId: asOptionalString(row.teamRefereeId),
  });

const mapEvent = (row: RawRow): Record<string, any> => {
  const start = asDate(row.start) ?? new Date();
  const end = asDate(row.end) ?? start;
  const coordinates = row.coordinates ?? (row.lat !== undefined && row.long !== undefined ? [row.lat, row.long] : [0, 0]);

  return withAuditFields(row, {
    id: pickId(row),
    name: requireString(row.name, 'event.name', 'Event'),
    start,
    end,
    description: asOptionalString(row.description),
    divisions: asStringArray(row.divisions),
    winnerSetCount: row.winnerSetCount === undefined ? undefined : asInt(row.winnerSetCount),
    loserSetCount: row.loserSetCount === undefined ? undefined : asInt(row.loserSetCount),
    doubleElimination: row.doubleElimination === undefined ? undefined : asBoolean(row.doubleElimination),
    location: requireString(row.location, 'event.location', ''),
    rating: row.rating === undefined ? undefined : asNumber(row.rating),
    teamSizeLimit: asInt(row.teamSizeLimit ?? row.teamSize, 0),
    maxParticipants: row.maxParticipants === undefined ? undefined : asInt(row.maxParticipants),
    minAge: row.minAge === undefined ? undefined : asInt(row.minAge),
    maxAge: row.maxAge === undefined ? undefined : asInt(row.maxAge),
    hostId: requireString(row.hostId ?? row.ownerId, 'event.hostId', ''),
    price: asInt(row.price ?? row.priceCents, 0),
    singleDivision: row.singleDivision === undefined ? undefined : asBoolean(row.singleDivision),
    waitListIds: asStringArray(row.waitListIds),
    freeAgentIds: asStringArray(row.freeAgentIds),
    cancellationRefundHours: row.cancellationRefundHours === undefined ? undefined : asInt(row.cancellationRefundHours),
    teamSignup: row.teamSignup === undefined ? undefined : asBoolean(row.teamSignup),
    prize: asOptionalString(row.prize),
    registrationCutoffHours: row.registrationCutoffHours === undefined ? undefined : asInt(row.registrationCutoffHours),
    seedColor: row.seedColor === undefined ? undefined : asInt(row.seedColor),
    imageId: requireString(row.imageId ?? row.image ?? row.imageID, 'event.imageId', ''),
    fieldCount: row.fieldCount === undefined ? undefined : asInt(row.fieldCount),
    winnerBracketPointsToVictory: asNumberArray(row.winnerBracketPointsToVictory),
    loserBracketPointsToVictory: asNumberArray(row.loserBracketPointsToVictory),
    coordinates,
    gamesPerOpponent: row.gamesPerOpponent === undefined ? undefined : asInt(row.gamesPerOpponent),
    includePlayoffs: row.includePlayoffs === undefined ? undefined : asBoolean(row.includePlayoffs),
    playoffTeamCount: row.playoffTeamCount === undefined ? undefined : asInt(row.playoffTeamCount),
    usesSets: row.usesSets === undefined ? undefined : asBoolean(row.usesSets),
    matchDurationMinutes: row.matchDurationMinutes === undefined ? undefined : asInt(row.matchDurationMinutes),
    setDurationMinutes: row.setDurationMinutes === undefined ? undefined : asInt(row.setDurationMinutes),
    setsPerMatch: row.setsPerMatch === undefined ? undefined : asInt(row.setsPerMatch),
    restTimeMinutes: row.restTimeMinutes === undefined ? undefined : asInt(row.restTimeMinutes),
    state: row.state ? normalizeEnum(row.state, ['PUBLISHED', 'UNPUBLISHED'], 'PUBLISHED') : undefined,
    pointsToVictory: asNumberArray(row.pointsToVictory),
    sportId: asOptionalString(row.sportId),
    timeSlotIds: asStringArray(row.timeSlotIds),
    fieldIds: asStringArray(row.fieldIds),
    teamIds: asStringArray(row.teamIds),
    userIds: asStringArray(row.userIds),
    registrationIds: asStringArray(row.registrationIds),
    leagueScoringConfigId: asOptionalString(row.leagueScoringConfigId),
    organizationId: asOptionalString(row.organizationId),
    autoCancellation: row.autoCancellation === undefined ? undefined : asBoolean(row.autoCancellation),
    eventType: row.eventType ? normalizeEnum(row.eventType, ['TOURNAMENT', 'EVENT', 'LEAGUE'], 'EVENT') : undefined,
    fieldType: row.fieldType ? normalizeEnum(row.fieldType, ['INDOOR', 'GRASS', 'SAND'], 'INDOOR') : undefined,
    doTeamsRef: row.doTeamsRef === undefined ? undefined : asBoolean(row.doTeamsRef),
    refereeIds: asStringArray(row.refereeIds),
    allowPaymentPlans: row.allowPaymentPlans === undefined ? undefined : asBoolean(row.allowPaymentPlans),
    installmentCount: row.installmentCount === undefined ? undefined : asInt(row.installmentCount),
    installmentDueDates: asDateArray(row.installmentDueDates),
    installmentAmounts: asNumberArray(row.installmentAmounts),
    allowTeamSplitDefault: row.allowTeamSplitDefault === undefined ? undefined : asBoolean(row.allowTeamSplitDefault),
    requiredTemplateIds: asStringArray(row.requiredTemplateIds),
  });
};

const mapProduct = (row: RawRow): Record<string, any> =>
  withAuditFields(row, {
    id: pickId(row),
    name: requireString(row.name, 'product.name', 'Product'),
    description: asOptionalString(row.description ?? row.desc),
    priceCents: asInt(row.priceCents ?? row.price, 0),
    period: normalizePeriod(row.period, 'MONTH'),
    organizationId: requireString(row.organizationId, 'product.organizationId', ''),
    createdBy: asOptionalString(row.createdBy ?? row.ownerId),
    isActive: row.isActive === undefined ? undefined : asBoolean(row.isActive),
    stripeProductId: asOptionalString(row.stripeProductId),
    stripePriceId: asOptionalString(row.stripePriceId),
  });

const mapSubscription = (row: RawRow): Record<string, any> => {
  const startDate = asDate(row.startDate ?? row.$createdAt ?? row.createdAt) ?? (strict ? undefined : new Date());
  if (!startDate && strict) {
    throw new Error('Missing required subscription.startDate');
  }

  return withAuditFields(row, {
    id: pickId(row),
    productId: requireString(row.productId, 'subscription.productId', ''),
    userId: requireString(row.userId, 'subscription.userId', ''),
    organizationId: asOptionalString(row.organizationId),
    startDate: startDate ?? new Date(),
    priceCents: asInt(row.priceCents ?? row.price, 0),
    period: normalizePeriod(row.period, 'MONTH'),
    status: row.status ? normalizeEnum(row.status, ['ACTIVE', 'CANCELLED'], 'ACTIVE') : undefined,
    stripeSubscriptionId: asOptionalString(row.stripeSubscriptionId),
  });
};

const mapTemplateDocument = (row: RawRow): Record<string, any> =>
  withAuditFields(row, {
    id: pickId(row),
    templateId: asOptionalString(row.templateId),
    type: row.type ? normalizeEnum(row.type, ['PDF', 'TEXT'], 'PDF') : undefined,
    organizationId: requireString(row.organizationId, 'templateDocument.organizationId', ''),
    title: requireString(row.title, 'templateDocument.title', 'Template'),
    description: asOptionalString(row.description),
    signOnce: row.signOnce === undefined ? undefined : asBoolean(row.signOnce),
    status: asOptionalString(row.status),
    createdBy: asOptionalString(row.createdBy),
    roleIndex: row.roleIndex === undefined ? undefined : asInt(row.roleIndex),
    roleIndexes: asNumberArray(row.roleIndexes),
    signerRoles: asStringArray(row.signerRoles),
    content: asOptionalString(row.content),
  });

const mapSignedDocument = (row: RawRow): Record<string, any> =>
  withAuditFields(row, {
    id: pickId(row),
    signedDocumentId: requireString(row.signedDocumentId ?? row.documentId, 'signedDocument.signedDocumentId', ''),
    templateId: requireString(row.templateId, 'signedDocument.templateId', ''),
    userId: requireString(row.userId, 'signedDocument.userId', ''),
    documentName: requireString(row.documentName ?? row.title ?? 'Document', 'signedDocument.documentName', 'Document'),
    hostId: asOptionalString(row.hostId),
    organizationId: asOptionalString(row.organizationId),
    eventId: asOptionalString(row.eventId),
    status: asOptionalString(row.status),
    signedAt: asOptionalString(row.signedAt),
    signerEmail: asOptionalString(row.signerEmail),
    roleIndex: row.roleIndex === undefined ? undefined : asInt(row.roleIndex),
    signerRole: asOptionalString(row.signerRole),
    ipAddress: asOptionalString(row.ipAddress),
    requestId: asOptionalString(row.requestId),
  });

const mapChatGroup = (row: RawRow): Record<string, any> =>
  withAuditFields(row, {
    id: pickId(row),
    name: asOptionalString(row.name),
    userIds: asStringArray(row.userIds),
    hostId: requireString(row.hostId ?? row.ownerId, 'chatGroup.hostId', ''),
  });

const mapMessage = (row: RawRow): Record<string, any> => {
  const sentTime = asDate(row.sentTime ?? row.createdAt ?? row.$createdAt) ?? (strict ? undefined : new Date());
  if (!sentTime && strict) {
    throw new Error('Missing required message.sentTime');
  }

  return withAuditFields(row, {
    id: pickId(row),
    body: requireString(row.body, 'message.body', ''),
    userId: requireString(row.userId, 'message.userId', ''),
    attachmentUrls: asStringArray(row.attachmentUrls),
    chatId: requireString(row.chatId, 'message.chatId', ''),
    readByIds: asStringArray(row.readByIds),
    sentTime: sentTime ?? new Date(),
  });
};

const mapBill = (row: RawRow): Record<string, any> =>
  withAuditFields(row, {
    id: pickId(row),
    ownerType: normalizeEnum(row.ownerType ?? row.ownerTypeEnum, ['USER', 'TEAM'], 'USER'),
    ownerId: requireString(row.ownerId, 'bill.ownerId', ''),
    organizationId: asOptionalString(row.organizationId),
    eventId: asOptionalString(row.eventId),
    totalAmountCents: asInt(row.totalAmountCents ?? row.totalAmount, 0),
    paidAmountCents: row.paidAmountCents === undefined ? undefined : asInt(row.paidAmountCents),
    nextPaymentDue: asDate(row.nextPaymentDue),
    nextPaymentAmountCents: row.nextPaymentAmountCents === undefined ? undefined : asInt(row.nextPaymentAmountCents),
    parentBillId: asOptionalString(row.parentBillId),
    allowSplit: row.allowSplit === undefined ? undefined : asBoolean(row.allowSplit),
    status: row.status ? normalizeEnum(row.status, ['OPEN', 'PAID', 'OVERDUE', 'CANCELLED'], 'OPEN') : undefined,
    paymentPlanEnabled: row.paymentPlanEnabled === undefined ? undefined : asBoolean(row.paymentPlanEnabled),
    createdBy: asOptionalString(row.createdBy),
  });

const mapBillPayment = (row: RawRow): Record<string, any> =>
  withAuditFields(row, {
    id: pickId(row),
    billId: requireString(row.billId, 'billPayment.billId', ''),
    sequence: asInt(row.sequence, 0),
    dueDate: asDate(row.dueDate) ?? (strict ? undefined : new Date()),
    amountCents: asInt(row.amountCents ?? row.amount, 0),
    status: row.status ? normalizeEnum(row.status, ['PENDING', 'PAID', 'VOID'], 'PENDING') : undefined,
    paidAt: asDate(row.paidAt),
    paymentIntentId: asOptionalString(row.paymentIntentId),
    payerUserId: asOptionalString(row.payerUserId),
  });

const mapRefundRequest = (row: RawRow): Record<string, any> =>
  withAuditFields(row, {
    id: pickId(row),
    eventId: requireString(row.eventId, 'refund.eventId', ''),
    userId: requireString(row.userId, 'refund.userId', ''),
    hostId: asOptionalString(row.hostId),
    reason: requireString(row.reason, 'refund.reason', 'requested_by_customer'),
    organizationId: asOptionalString(row.organizationId),
    status: row.status ? normalizeEnum(row.status, ['WAITING', 'APPROVED', 'REJECTED'], 'WAITING') : undefined,
  });

const mapRegistration = (row: RawRow): Record<string, any> =>
  withAuditFields(row, {
    id: pickId(row),
    eventId: requireString(row.eventId, 'registration.eventId', ''),
    registrantId: requireString(row.registrantId ?? row.userId, 'registration.registrantId', ''),
    parentId: asOptionalString(row.parentId),
    registrantType: normalizeEnum(row.registrantType, ['SELF', 'CHILD', 'TEAM'], 'SELF'),
    status: normalizeEnum(row.status, ['PENDINGCONSENT', 'ACTIVE', 'BLOCKED', 'CANCELLED', 'CONSENTFAILED'], 'ACTIVE'),
    ageAtEvent: row.ageAtEvent === undefined ? undefined : asInt(row.ageAtEvent),
    consentDocumentId: asOptionalString(row.consentDocumentId),
    consentStatus: asOptionalString(row.consentStatus),
    createdBy: requireString(row.createdBy ?? row.userId, 'registration.createdBy', ''),
  });

const mapParentChildLink = (row: RawRow): Record<string, any> =>
  withAuditFields(row, {
    id: pickId(row),
    parentId: requireString(row.parentId, 'parentChildLink.parentId', ''),
    childId: requireString(row.childId, 'parentChildLink.childId', ''),
    status: normalizeEnum(row.status, ['PENDING', 'ACTIVE', 'REVOKED', 'INACTIVE'], 'PENDING'),
    relationship: asOptionalString(row.relationship),
    linkMethod: asOptionalString(row.linkMethod),
    createdBy: requireString(row.createdBy ?? row.parentId, 'parentChildLink.createdBy', ''),
    endedAt: asDate(row.endedAt),
  });

const mapInvite = (row: RawRow): Record<string, any> =>
  withAuditFields(row, {
    id: pickId(row),
    type: requireString(row.type, 'invite.type', 'TEAM'),
    email: requireString(row.email, 'invite.email', ''),
    status: asOptionalString(row.status),
    eventId: asOptionalString(row.eventId),
    organizationId: asOptionalString(row.organizationId),
    teamId: asOptionalString(row.teamId),
    userId: asOptionalString(row.userId),
    createdBy: asOptionalString(row.createdBy),
    firstName: asOptionalString(row.firstName),
    lastName: asOptionalString(row.lastName),
  });

const leagueScoringFields = [
  'pointsForWin',
  'pointsForDraw',
  'pointsForLoss',
  'pointsForForfeitWin',
  'pointsForForfeitLoss',
  'pointsPerSetWin',
  'pointsPerSetLoss',
  'pointsPerGameWin',
  'pointsPerGameLoss',
  'pointsPerGoalScored',
  'pointsPerGoalConceded',
  'maxGoalBonusPoints',
  'minGoalBonusThreshold',
  'pointsForShutout',
  'pointsForCleanSheet',
  'applyShutoutOnlyIfWin',
  'pointsPerGoalDifference',
  'maxGoalDifferencePoints',
  'pointsPenaltyPerGoalDifference',
  'pointsForParticipation',
  'pointsForNoShow',
  'pointsForWinStreakBonus',
  'winStreakThreshold',
  'pointsForOvertimeWin',
  'pointsForOvertimeLoss',
  'overtimeEnabled',
  'pointsPerRedCard',
  'pointsPerYellowCard',
  'pointsPerPenalty',
  'maxPenaltyDeductions',
  'maxPointsPerMatch',
  'minPointsPerMatch',
  'goalDifferenceTiebreaker',
  'headToHeadTiebreaker',
  'totalGoalsTiebreaker',
  'enableBonusForComebackWin',
  'bonusPointsForComebackWin',
  'enableBonusForHighScoringMatch',
  'highScoringThreshold',
  'bonusPointsForHighScoringMatch',
  'enablePenaltyForUnsportingBehavior',
  'penaltyPointsForUnsportingBehavior',
  'pointPrecision',
];

const mapLeagueScoringConfig = (row: RawRow): Record<string, any> => {
  const data: Record<string, any> = {
    id: pickId(row),
  };
  for (const field of leagueScoringFields) {
    if (row[field] !== undefined) {
      const value = typeof row[field] === 'boolean' ? asBoolean(row[field]) : asNumber(row[field]);
      data[field] = value;
    }
  }
  return withAuditFields(row, data);
};

const sportFields = [
  'usePointsForWin',
  'usePointsForDraw',
  'usePointsForLoss',
  'usePointsForForfeitWin',
  'usePointsForForfeitLoss',
  'usePointsPerSetWin',
  'usePointsPerSetLoss',
  'usePointsPerGameWin',
  'usePointsPerGameLoss',
  'usePointsPerGoalScored',
  'usePointsPerGoalConceded',
  'useMaxGoalBonusPoints',
  'useMinGoalBonusThreshold',
  'usePointsForShutout',
  'usePointsForCleanSheet',
  'useApplyShutoutOnlyIfWin',
  'usePointsPerGoalDifference',
  'useMaxGoalDifferencePoints',
  'usePointsPenaltyPerGoalDifference',
  'usePointsForParticipation',
  'usePointsForNoShow',
  'usePointsForWinStreakBonus',
  'useWinStreakThreshold',
  'usePointsForOvertimeWin',
  'usePointsForOvertimeLoss',
  'useOvertimeEnabled',
  'usePointsPerRedCard',
  'usePointsPerYellowCard',
  'usePointsPerPenalty',
  'useMaxPenaltyDeductions',
  'useMaxPointsPerMatch',
  'useMinPointsPerMatch',
  'useGoalDifferenceTiebreaker',
  'useHeadToHeadTiebreaker',
  'useTotalGoalsTiebreaker',
  'useEnableBonusForComebackWin',
  'useBonusPointsForComebackWin',
  'useEnableBonusForHighScoringMatch',
  'useHighScoringThreshold',
  'useBonusPointsForHighScoringMatch',
  'useEnablePenaltyUnsporting',
  'usePenaltyPointsUnsporting',
  'usePointPrecision',
];

const mapSport = (row: RawRow): Record<string, any> => {
  const data: Record<string, any> = {
    id: pickId(row),
    name: requireString(row.name, 'sport.name', 'Sport'),
  };
  for (const field of sportFields) {
    if (row[field] !== undefined) {
      data[field] = asBoolean(row[field]);
    }
  }
  return withAuditFields(row, data);
};

const collections: CollectionConfig[] = [
  { name: 'organizations', tableId: process.env.APPWRITE_ORGANIZATIONS_TABLE_ID ?? 'organizations', model: 'organizations', map: mapOrganization },
  { name: 'userData', tableId: process.env.APPWRITE_USERS_TABLE_ID ?? 'userData', model: 'userData', map: mapUserData },
  { name: 'volleyBallTeams', tableId: process.env.APPWRITE_TEAMS_TABLE_ID ?? 'volleyBallTeams', model: 'volleyBallTeams', map: mapTeam },
  { name: 'events', tableId: process.env.APPWRITE_EVENTS_TABLE_ID ?? 'events', model: 'events', map: mapEvent },
  { name: 'fields', tableId: process.env.APPWRITE_FIELDS_TABLE_ID ?? 'fields', model: 'fields', map: mapField },
  { name: 'timeSlots', tableId: process.env.APPWRITE_TIME_SLOTS_TABLE_ID ?? 'timeSlots', model: 'timeSlots', map: mapTimeSlot },
  { name: 'matches', tableId: process.env.APPWRITE_MATCHES_TABLE_ID ?? 'matches', model: 'matches', map: mapMatch },
  { name: 'products', tableId: process.env.APPWRITE_PRODUCTS_TABLE_ID ?? 'products', model: 'products', map: mapProduct },
  { name: 'subscriptions', tableId: process.env.APPWRITE_SUBSCRIPTIONS_TABLE_ID ?? 'subscriptions', model: 'subscriptions', map: mapSubscription },
  { name: 'templateDocuments', tableId: process.env.APPWRITE_TEMPLATE_DOCUMENTS_TABLE_ID ?? 'templateDocuments', model: 'templateDocuments', map: mapTemplateDocument },
  { name: 'signedDocuments', tableId: process.env.APPWRITE_SIGNED_DOCUMENTS_TABLE_ID ?? 'signedDocuments', model: 'signedDocuments', map: mapSignedDocument },
  { name: 'chatGroup', tableId: process.env.APPWRITE_CHAT_GROUPS_TABLE_ID ?? 'chatGroup', model: 'chatGroup', map: mapChatGroup },
  { name: 'messages', tableId: process.env.APPWRITE_MESSAGES_TABLE_ID ?? 'messages', model: 'messages', map: mapMessage },
  { name: 'bills', tableId: process.env.APPWRITE_BILLS_TABLE_ID ?? 'bills', model: 'bills', map: mapBill },
  { name: 'billPayments', tableId: process.env.APPWRITE_BILL_PAYMENTS_TABLE_ID ?? 'billPayments', model: 'billPayments', map: mapBillPayment },
  { name: 'refundRequests', tableId: process.env.APPWRITE_REFUND_REQUESTS_TABLE_ID ?? 'refundRequests', model: 'refundRequests', map: mapRefundRequest },
  { name: 'eventRegistrations', tableId: process.env.APPWRITE_EVENT_REGISTRATIONS_TABLE_ID ?? 'eventRegistrations', model: 'eventRegistrations', map: mapRegistration },
  { name: 'parentChildLinks', tableId: process.env.APPWRITE_PARENT_CHILD_LINKS_TABLE_ID ?? 'parentChildLinks', model: 'parentChildLinks', map: mapParentChildLink },
  { name: 'leagueScoringConfigs', tableId: process.env.APPWRITE_LEAGUE_SCORING_CONFIG_TABLE_ID ?? 'leagueScoringConfigs', model: 'leagueScoringConfigs', map: mapLeagueScoringConfig },
  { name: 'sports', tableId: process.env.APPWRITE_SPORTS_TABLE_ID ?? 'sports', model: 'sports', map: mapSport },
  { name: 'invites', tableId: process.env.APPWRITE_INVITES_TABLE_ID ?? 'invites', model: 'invites', map: mapInvite },
];

const loadFromExport = async (exportDir: string, config: CollectionConfig): Promise<RawRow[]> => {
  const filePath = path.join(exportDir, `${config.name}.json`);
  const contents = await fs.readFile(filePath, 'utf8');
  const parsed = JSON.parse(contents);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.documents)) return parsed.documents;
  if (Array.isArray(parsed?.rows)) return parsed.rows;
  if (Array.isArray(parsed?.data)) return parsed.data;
  return [];
};

const buildRestPath = (databaseId: string, tableId: string, apiMode: string): string => {
  if (apiMode === 'tables') {
    return `/v1/tables/${databaseId}/tables/${tableId}/rows`;
  }
  return `/v1/databases/${databaseId}/collections/${tableId}/documents`;
};

const fetchFromRest = async (config: CollectionConfig): Promise<RawRow[]> => {
  const endpoint = process.env.APPWRITE_ENDPOINT;
  const projectId = process.env.APPWRITE_PROJECT_ID;
  const apiKey = process.env.APPWRITE_API_KEY;
  const databaseId = process.env.APPWRITE_DATABASE_ID;

  if (!endpoint || !projectId || !databaseId) {
    throw new Error('APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, and APPWRITE_DATABASE_ID are required for REST mode.');
  }

  const apiMode = process.env.APPWRITE_API_MODE ?? 'databases';
  const queryMode = process.env.APPWRITE_QUERY_MODE ?? 'queries';
  const pageSize = process.env.APPWRITE_PAGE_SIZE ? Number(process.env.APPWRITE_PAGE_SIZE) : 100;

  const headers: Record<string, string> = {
    'X-Appwrite-Project': projectId,
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers['X-Appwrite-Key'] = apiKey;
  }

  const items: RawRow[] = [];
  let offset = 0;

  while (true) {
    const pathSegment = buildRestPath(databaseId, config.tableId, apiMode);
    const url = new URL(pathSegment, endpoint);
    if (queryMode === 'queries') {
      url.searchParams.append('queries[]', `limit(${pageSize})`);
      url.searchParams.append('queries[]', `offset(${offset})`);
    } else {
      url.searchParams.set('limit', String(pageSize));
      url.searchParams.set('offset', String(offset));
    }

    const response = await fetch(url.toString(), { headers });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to fetch ${config.name}: ${response.status} ${text}`);
    }
    const payload = await response.json();
    const batch: RawRow[] = payload.documents ?? payload.rows ?? payload.data ?? [];
    if (!Array.isArray(batch) || batch.length === 0) break;

    items.push(...batch);
    offset += batch.length;
    if (batch.length < pageSize) break;
  }

  return items;
};

const loadCollection = async (config: CollectionConfig): Promise<RawRow[]> => {
  const source = process.env.APPWRITE_SOURCE ?? (process.env.APPWRITE_EXPORT_DIR ? 'export' : 'rest');
  if (source === 'export') {
    const exportDir = process.env.APPWRITE_EXPORT_DIR;
    if (!exportDir) {
      throw new Error('APPWRITE_EXPORT_DIR is required when APPWRITE_SOURCE=export');
    }
    return loadFromExport(exportDir, config);
  }
  return fetchFromRest(config);
};

const upsertCollection = async (config: CollectionConfig, rows: RawRow[]): Promise<void> => {
  const delegate = (prisma as any)[config.model];
  if (!delegate) {
    throw new Error(`Prisma model delegate not found: ${config.model}`);
  }

  const limit = limitOverride ?? rows.length;
  const slice = rows.slice(0, limit);

  let processed = 0;
  for (const row of slice) {
    const data = config.map(row);
    if (!data) continue;

    if (dryRun) {
      processed += 1;
      continue;
    }

    await delegate.upsert({
      where: { id: data.id },
      update: data,
      create: data,
    });
    processed += 1;
  }

  console.log(`[migrate] ${config.name}: ${processed}/${slice.length} upserts${dryRun ? ' (dry-run)' : ''}`);
};

const run = async (): Promise<void> => {
  try {
    for (const config of collections) {
      console.log(`[migrate] Loading ${config.name}...`);
      const rows = await loadCollection(config);
      console.log(`[migrate] ${config.name}: ${rows.length} records loaded.`);
      await upsertCollection(config, rows);
    }
  } finally {
    await prisma.$disconnect();
  }
};

run().catch((error) => {
  console.error('[migrate] Failed:', error);
  process.exit(1);
});
