ALTER TABLE "Fields" ADD COLUMN "createdBy" TEXT;
CREATE INDEX IF NOT EXISTS "Fields_createdBy_idx" ON "Fields"("createdBy");