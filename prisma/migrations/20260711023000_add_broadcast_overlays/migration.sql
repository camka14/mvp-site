CREATE TABLE "BroadcastOverlays" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "eventId" TEXT NOT NULL,
  "organizationId" TEXT,
  "name" TEXT NOT NULL,
  "templateKey" TEXT NOT NULL DEFAULT 'COMPACT_SCOREBUG',
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "draftConfig" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "publishedConfig" JSONB,
  "publishedConfigRevision" INTEGER NOT NULL DEFAULT 0,
  "publishedAt" TIMESTAMP(3),
  "publishedByUserId" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "updatedByUserId" TEXT,
  "archivedAt" TIMESTAMP(3),
  "archivedByUserId" TEXT,
  "archiveReason" TEXT,

  CONSTRAINT "BroadcastOverlays_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BroadcastOverlays_eventId_status_createdAt_idx"
  ON "BroadcastOverlays"("eventId", "status", "createdAt");
CREATE INDEX "BroadcastOverlays_organizationId_status_idx"
  ON "BroadcastOverlays"("organizationId", "status");
CREATE INDEX "BroadcastOverlays_archivedAt_idx"
  ON "BroadcastOverlays"("archivedAt");

CREATE TABLE "BroadcastOverlayStates" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "overlayId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "activeMatchId" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "scoringMode" TEXT NOT NULL DEFAULT 'AUTOMATIC',
  "presentationState" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "automaticShadowState" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "manualOverrideBaseRevision" INTEGER,
  "manualOverrideStartedAt" TIMESTAMP(3),
  "manualOverrideStartedByUserId" TEXT,
  "manualOverrideReason" TEXT,
  "updatedByUserId" TEXT,

  CONSTRAINT "BroadcastOverlayStates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BroadcastOverlayStates_overlayId_key"
  ON "BroadcastOverlayStates"("overlayId");
CREATE INDEX "BroadcastOverlayStates_eventId_activeMatchId_idx"
  ON "BroadcastOverlayStates"("eventId", "activeMatchId");
CREATE INDEX "BroadcastOverlayStates_activeMatchId_idx"
  ON "BroadcastOverlayStates"("activeMatchId");

CREATE TABLE "BroadcastOverlayActions" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "overlayId" TEXT NOT NULL,
  "organizationId" TEXT,
  "eventId" TEXT NOT NULL,
  "matchId" TEXT,
  "accessTokenId" TEXT,
  "actorUserId" TEXT,
  "actorKind" TEXT NOT NULL DEFAULT 'USER',
  "actionType" TEXT NOT NULL,
  "baseRevision" INTEGER,
  "presentationRevision" INTEGER NOT NULL,
  "requestId" TEXT NOT NULL,
  "payload" JSONB NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT "BroadcastOverlayActions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BroadcastOverlayActions_overlayId_requestId_key"
  ON "BroadcastOverlayActions"("overlayId", "requestId");
CREATE INDEX "BroadcastOverlayActions_overlayId_presentationRevision_createdAt_idx"
  ON "BroadcastOverlayActions"("overlayId", "presentationRevision", "createdAt");
CREATE INDEX "BroadcastOverlayActions_eventId_idx" ON "BroadcastOverlayActions"("eventId");
CREATE INDEX "BroadcastOverlayActions_matchId_idx" ON "BroadcastOverlayActions"("matchId");
CREATE INDEX "BroadcastOverlayActions_accessTokenId_idx" ON "BroadcastOverlayActions"("accessTokenId");

CREATE TABLE "BroadcastOverlayAccessTokens" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "overlayId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "label" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "revokedByUserId" TEXT,
  "revokeReason" TEXT,
  "lastUsedAt" TIMESTAMP(3),

  CONSTRAINT "BroadcastOverlayAccessTokens_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BroadcastOverlayAccessTokens_overlayId_revokedAt_createdAt_idx"
  ON "BroadcastOverlayAccessTokens"("overlayId", "revokedAt", "createdAt");
CREATE INDEX "BroadcastOverlayAccessTokens_expiresAt_idx"
  ON "BroadcastOverlayAccessTokens"("expiresAt");
CREATE INDEX "BroadcastOverlayAccessTokens_tokenHash_idx"
  ON "BroadcastOverlayAccessTokens"("tokenHash");
