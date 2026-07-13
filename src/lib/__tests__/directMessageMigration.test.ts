/** @jest-environment node */

import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const schemaPath = path.join(root, 'prisma', 'schema.prisma');
const migrationPath = path.join(
  root,
  'prisma',
  'migrations',
  '20260713213500_add_canonical_direct_message_pair',
  'migration.sql',
);

describe('canonical direct-message database contract', () => {
  it('transactionally keys one legacy winner without merging unrelated histories', () => {
    const schema = readFileSync(schemaPath, 'utf8');
    const migration = readFileSync(migrationPath, 'utf8');

    expect(schema).toMatch(/model ChatGroup[\s\S]*?directUserIdA\s+String\?/);
    expect(schema).toMatch(/model ChatGroup[\s\S]*?directUserIdB\s+String\?/);
    expect(schema).toContain('@@unique([directUserIdA, directUserIdB])');
    expect(migration.trimStart()).toMatch(/^BEGIN;/);
    expect(migration.trimEnd()).toMatch(/COMMIT;$/);
    expect(migration).toContain('LEAST("userIds"[1], "userIds"[2])');
    expect(migration).toContain('GREATEST("userIds"[1], "userIds"[2])');
    expect(migration).toContain('ROW_NUMBER() OVER');
    expect(migration).toContain("LOWER(\"id\") !~ '^(user_|team_|event_|tournament_|match_)'");
    expect(migration).not.toContain('UPDATE "Messages"');
    expect(migration).not.toContain('UPDATE "ModerationReport"');
    expect(migration).not.toContain('DIRECT_MESSAGE_DUPLICATE_CONSOLIDATED');
    expect(migration).toContain('CREATE UNIQUE INDEX "ChatGroup_directUserIdA_directUserIdB_key"');
  });
});
