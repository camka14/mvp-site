CREATE TABLE "AiConversationPointer" (
  "userId" TEXT NOT NULL,
  "openaiConversationId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "lastOpenedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AiConversationPointer_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "AiPendingConfirmation" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "sessionId" TEXT,
  "openaiConversationId" TEXT NOT NULL,
  "toolName" TEXT NOT NULL,
  "args" JSONB NOT NULL,
  "summary" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AiPendingConfirmation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiConversationPointer_openaiConversationId_idx"
  ON "AiConversationPointer"("openaiConversationId");

CREATE INDEX "AiPendingConfirmation_userId_openaiConversationId_status_idx"
  ON "AiPendingConfirmation"("userId", "openaiConversationId", "status");

CREATE INDEX "AiPendingConfirmation_sessionId_openaiConversationId_status_idx"
  ON "AiPendingConfirmation"("sessionId", "openaiConversationId", "status");

CREATE INDEX "AiPendingConfirmation_expiresAt_idx"
  ON "AiPendingConfirmation"("expiresAt");
