ALTER TABLE "UserData"
ADD COLUMN "notificationSettings" JSONB NOT NULL DEFAULT '{}';
