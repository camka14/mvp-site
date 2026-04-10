ALTER TABLE "UserData"
ADD COLUMN "requiredProfileFieldsCompletedAt" TIMESTAMP(3);

ALTER TABLE "AuthUser"
ADD COLUMN "googleSubject" TEXT;

CREATE UNIQUE INDEX "AuthUser_googleSubject_key" ON "AuthUser"("googleSubject");
