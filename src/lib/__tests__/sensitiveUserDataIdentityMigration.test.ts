/** @jest-environment node */

import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const schemaPath = path.join(root, 'prisma', 'schema.prisma');
const migrationPath = path.join(
  root,
  'prisma',
  'migrations',
  '20260712170000_enforce_sensitive_user_data_identity_uniqueness',
  'migration.sql',
);

describe('SensitiveUserData identity contract', () => {
  it('enforces one canonical sensitive row for each user and normalized email', () => {
    const schema = readFileSync(schemaPath, 'utf8');
    const migration = readFileSync(migrationPath, 'utf8');

    expect(schema).toMatch(/model SensitiveUserData[\s\S]*?userId\s+String\s+@unique/);
    expect(schema).toMatch(/model SensitiveUserData[\s\S]*?email\s+String\s+@unique/);
    expect(migration).toContain('GROUP BY "userId"');
    expect(migration).toContain('GROUP BY LOWER(BTRIM("email"))');
    expect(migration).toContain('SET "email" = LOWER(BTRIM("email"))');
    expect(migration).toContain('CREATE UNIQUE INDEX "SensitiveUserData_userId_key"');
    expect(migration).toContain('CREATE UNIQUE INDEX "SensitiveUserData_email_key"');
  });
});
