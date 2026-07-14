/** @jest-environment node */

import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const schemaPath = path.join(root, 'prisma', 'schema.prisma');
const migrationPath = path.join(
  root,
  'prisma',
  'migrations',
  '20260713230000_enforce_canonical_sport_names',
  'migration.sql',
);

describe('canonical sport identity database contract', () => {
  it('rewrites every relational shape before enforcing trimmed case-insensitive uniqueness', () => {
    const schema = readFileSync(schemaPath, 'utf8');
    const migration = readFileSync(migrationPath, 'utf8');

    expect(schema).toContain('Sports_name_ci_key expression index');
    expect(migration.trimStart()).toMatch(/^BEGIN;/);
    expect(migration.trimEnd()).toMatch(/COMMIT;$/);
    expect(migration).toContain('CREATE TEMP TABLE "_SportCanonicalGroups"');
    expect(migration).toContain('CREATE TEMP TABLE "_SportConfigurationValues"');
    expect(migration).toContain('CREATE TEMP TABLE "_SportMergedConfiguration"');
    expect(migration).toContain('Conflicting non-null Sports configuration');
    expect(migration).toContain('jsonb_populate_record(NULL::"Sports"');
    expect(migration).toContain('CREATE TEMP TABLE "_SportIdReferenceMap"');
    expect(migration).toContain('CREATE TEMP TABLE "_SportDuplicateMap"');
    expect(migration).toContain('lower(btrim(scored."id")) = scored.normalized_name');
    expect(migration).toContain('scored.populated_configuration_count DESC');
    expect(migration).toContain('UPDATE "Events"');
    expect(migration).toContain('by_name.normalized_name = lower(btrim(event."sportId"))');
    expect(migration).toContain('UPDATE "Divisions"');
    expect(migration).toContain('by_name.normalized_name = lower(btrim(division."sportId"))');
    expect(migration).toContain('UPDATE "EventTemplates"');
    expect(migration).toContain('by_name.normalized_name = lower(btrim(template."sportId"))');
    expect(migration).toContain('UPDATE "Fields"');
    expect(migration).toContain('unnest(field."sportIds") WITH ORDINALITY');
    expect(migration).toContain('by_name.normalized_name = lower(btrim(source.sport_id))');
    expect(migration).toContain('UPDATE "EventTeams"');
    expect(migration).toContain('ON by_id.source_id = team."sport"');
    expect(migration).toContain('AND by_name.normalized_name = lower(btrim(team."sport"))');
    expect(migration).toContain('UPDATE "Teams"');
    expect(migration).toContain('UPDATE "Organizations"');
    expect(migration).toContain('unnest(organization."sports") WITH ORDINALITY');
    expect(migration).toContain('DELETE FROM "Sports"');
    expect(migration).toContain('CONSTRAINT "Sports_name_nonblank_check"');
    expect(migration).toContain('CHECK ("name" = btrim("name") AND "name" <> \'\')');
    expect(migration).toContain('CREATE UNIQUE INDEX "Sports_name_ci_key"');
    expect(migration).toContain('ON "Sports" (lower("name"))');
  });
});
