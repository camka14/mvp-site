ALTER TABLE "AuthUser"
ADD COLUMN "appleSubject" TEXT;

ALTER TABLE "SensitiveUserData"
ADD COLUMN "appleRefreshToken" TEXT;

CREATE UNIQUE INDEX "AuthUser_appleSubject_key" ON "AuthUser"("appleSubject");
