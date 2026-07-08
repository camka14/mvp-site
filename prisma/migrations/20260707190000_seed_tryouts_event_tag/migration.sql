INSERT INTO "EventTags" ("id", "name", "slug")
VALUES ('default_tag_tryouts', 'Tryouts', 'tryouts')
ON CONFLICT ("slug") DO UPDATE
SET "name" = EXCLUDED."name",
    "updatedAt" = CURRENT_TIMESTAMP;
