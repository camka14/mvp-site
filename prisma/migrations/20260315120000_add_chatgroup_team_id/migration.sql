ALTER TABLE "ChatGroup"
ADD COLUMN "teamId" TEXT;

CREATE UNIQUE INDEX "ChatGroup_teamId_key"
ON "ChatGroup"("teamId");
