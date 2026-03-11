CREATE INDEX IF NOT EXISTS "ChatGroup_userIds_gin_idx"
  ON "ChatGroup" USING GIN ("userIds");
