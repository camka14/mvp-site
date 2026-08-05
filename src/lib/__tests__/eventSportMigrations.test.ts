/** @jest-environment node */

import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const readMigration = (name: string): string => readFileSync(
  path.join(root, 'prisma', 'migrations', name, 'migration.sql'),
  'utf8',
);

describe('event and organization sport migrations', () => {
  it('backfills canonical event sport lists and rejects unsafe results', () => {
    const migration = readMigration('20260805160000_migrate_event_sport_ids');

    expect(migration.trimStart()).toMatch(/^BEGIN;/);
    expect(migration.trimEnd()).toMatch(/COMMIT;$/);
    expect(migration).toContain('ARRAY[\'Grass Soccer\']::TEXT[]');
    expect(migration).toContain('ARRAY[\'Indoor Volleyball\']::TEXT[]');
    expect(migration).toContain('ARRAY[\'Baseball\', \'Softball\']::TEXT[]');
    expect(migration).toContain('Event sport migration left one or more non-template events without sportIds.');
    expect(migration).toContain('Event sport migration produced a non-canonical sport name.');
    expect(migration).toContain('Event sport migration produced a multi-sport league or tournament.');
    expect(migration).toContain('ALTER TABLE "Events" DROP COLUMN "sportId"');
    expect(migration).toContain('ALTER TABLE "EventTemplates" DROP COLUMN "sportId"');
  });

  it('splits only known affiliate aliases and removes unsupported labels', () => {
    const migration = readMigration('20260805161000_repair_affiliate_organization_sport_aliases');

    expect(migration).toContain("WHEN 'soccer' THEN ARRAY['Grass Soccer']::TEXT[]");
    expect(migration).toContain("WHEN 'volleyball' THEN ARRAY['Indoor Volleyball']::TEXT[]");
    expect(migration).toContain("WHEN 'tennis and pickleball' THEN ARRAY['Tennis', 'Pickleball']::TEXT[]");
    expect(migration).toContain("WHEN 'basketball and volleyball' THEN ARRAY['Basketball', 'Indoor Volleyball']::TEXT[]");
    expect(migration).toContain('Unsupported labels are removed instead of guessed.');
    expect(migration).toContain('cardinality(organization."sports") = 0');
    expect(migration).toContain('Affiliate organization sport repair left a non-canonical sport name.');
  });
});
