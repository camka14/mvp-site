CREATE TABLE "EventTags" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,

  CONSTRAINT "EventTags_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EventTagAssignments" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "eventId" TEXT NOT NULL,
  "tagId" TEXT NOT NULL,
  "tagNameSnapshot" TEXT NOT NULL,

  CONSTRAINT "EventTagAssignments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventTags_slug_key" ON "EventTags"("slug");
CREATE INDEX "EventTags_name_idx" ON "EventTags"("name");
CREATE UNIQUE INDEX "EventTagAssignments_eventId_tagId_key" ON "EventTagAssignments"("eventId", "tagId");
CREATE INDEX "EventTagAssignments_eventId_idx" ON "EventTagAssignments"("eventId");
CREATE INDEX "EventTagAssignments_tagId_idx" ON "EventTagAssignments"("tagId");
