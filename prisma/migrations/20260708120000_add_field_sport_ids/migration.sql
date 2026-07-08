ALTER TABLE "Fields"
ADD COLUMN "sportIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX "Fields_sportIds_idx" ON "Fields" USING GIN ("sportIds");
