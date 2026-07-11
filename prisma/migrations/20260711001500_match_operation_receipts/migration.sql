CREATE TABLE "MatchOperationReceipts" (
  "clientOperationId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "eventId" TEXT NOT NULL,
  "matchId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "clientDeviceId" TEXT,
  "clientSequence" INTEGER,
  "operationKind" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,

  CONSTRAINT "MatchOperationReceipts_pkey" PRIMARY KEY ("clientOperationId")
);

CREATE INDEX "MatchOperationReceipts_eventId_matchId_idx"
  ON "MatchOperationReceipts"("eventId", "matchId");

CREATE INDEX "MatchOperationReceipts_matchId_actorUserId_clientDeviceId_clientSequence_idx"
  ON "MatchOperationReceipts"("matchId", "actorUserId", "clientDeviceId", "clientSequence");
