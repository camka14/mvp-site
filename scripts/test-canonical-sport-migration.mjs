import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const { Client } = pg;

const connectionString = process.env.SPORT_MIGRATION_TEST_DATABASE_URL;
if (!connectionString) {
  throw new Error(
    'Set SPORT_MIGRATION_TEST_DATABASE_URL to a disposable local PostgreSQL database URL.',
  );
}

const parsedConnection = new URL(connectionString);
const hostname = parsedConnection.hostname.replace(/^\[|\]$/g, '').toLowerCase();
if (!['localhost', '127.0.0.1', '::1'].includes(hostname)) {
  throw new Error('The canonical sport migration fixture refuses non-loopback databases.');
}

const fixtureSuffix = `${process.pid}_${Date.now()}`;
const fixtureSchemas = [
  `sport_identity_fixture_${fixtureSuffix}`,
  `sport_identity_conflict_${fixtureSuffix}`,
];
if (fixtureSchemas.some((schema) => !/^[a-z0-9_]+$/.test(schema))) {
  throw new Error('Unable to create safe fixture schema names.');
}
const [fixtureSchema, conflictSchema] = fixtureSchemas;
const quotedFixtureSchema = `"${fixtureSchema}"`;
const quotedConflictSchema = `"${conflictSchema}"`;
const migrationPath = path.join(
  process.cwd(),
  'prisma',
  'migrations',
  '20260713230000_enforce_canonical_sport_names',
  'migration.sql',
);

const client = new Client({ connectionString });
let connected = false;

const createFixtureTables = async () => {
  await client.query(`
    CREATE TABLE "Sports" (
      "id" TEXT PRIMARY KEY,
      "createdAt" TIMESTAMP(3),
      "updatedAt" TIMESTAMP(3),
      "name" TEXT NOT NULL,
      "usePointsForWin" BOOLEAN,
      "usePointsForDraw" BOOLEAN,
      "matchRulesTemplate" JSONB
    );
    CREATE TABLE "Events" ("id" TEXT PRIMARY KEY, "sportId" TEXT);
    CREATE TABLE "Divisions" ("id" TEXT PRIMARY KEY, "sportId" TEXT);
    CREATE TABLE "EventTemplates" ("id" TEXT PRIMARY KEY, "sportId" TEXT);
    CREATE TABLE "Fields" ("id" TEXT PRIMARY KEY, "sportIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]);
    CREATE TABLE "EventTeams" ("id" TEXT PRIMARY KEY, "sport" TEXT);
    CREATE TABLE "Teams" ("id" TEXT PRIMARY KEY, "sport" TEXT);
    CREATE TABLE "Organizations" ("id" TEXT PRIMARY KEY, "sports" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]);
  `);
};

const expectRejectedInsert = async (id, name, expectedConstraint, sequence) => {
  const savepoint = `sport_constraint_${sequence}`;
  await client.query(`SAVEPOINT ${savepoint}`);
  let rejection;
  try {
    await client.query('INSERT INTO "Sports" ("id", "name") VALUES ($1, $2)', [id, name]);
  } catch (error) {
    rejection = error;
  }
  await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
  await client.query(`RELEASE SAVEPOINT ${savepoint}`);
  assert.ok(rejection, `Expected sport name ${JSON.stringify(name)} to be rejected.`);
  assert.equal(rejection.constraint, expectedConstraint);
};

try {
  await client.connect();
  connected = true;
  await client.query(`CREATE SCHEMA ${quotedFixtureSchema}`);
  await client.query(`SET search_path TO ${quotedFixtureSchema}`);
  await createFixtureTables();
  await client.query(`
    INSERT INTO "Sports" (
      "id",
      "createdAt",
      "name",
      "usePointsForWin",
      "usePointsForDraw",
      "matchRulesTemplate"
    ) VALUES
      ('Indoor Volleyball', '2026-01-01', ' Indoor Volleyball ', NULL, NULL, NULL),
      ('sport_indoor_volleyball_duplicate', '2025-01-01', 'indoor volleyball', TRUE, FALSE, '{"scoringModel":"SETS"}'),
      ('Basketball', '2027-01-01', 'INDOOR VOLLEYBALL', NULL, NULL, NULL),
      ('sport_basketball_sparse', '2024-01-01', 'Basketball', NULL, FALSE, NULL),
      ('sport_basketball_rich', '2026-01-01', ' Basketball ', TRUE, NULL, '{"scoringModel":"PERIODS"}'),
      ('Other', '2024-01-01', 'Other', NULL, NULL, NULL);

    INSERT INTO "Events" ("id", "sportId") VALUES
      ('event_volleyball', 'sport_indoor_volleyball_duplicate'),
      ('event_basketball', ' BASKETBALL ');
    INSERT INTO "Divisions" ("id", "sportId") VALUES
      ('division_volleyball', ' indoor volleyball ');
    INSERT INTO "EventTemplates" ("id", "sportId") VALUES
      ('template_volleyball', 'INDOOR VOLLEYBALL');
    INSERT INTO "Fields" ("id", "sportIds") VALUES
      ('field_1', ARRAY['Other', 'sport_indoor_volleyball_duplicate', ' indoor volleyball ', 'Indoor Volleyball', ' BASKETBALL ', 'sport_basketball_sparse', 'sport_basketball_rich']);
    INSERT INTO "EventTeams" ("id", "sport") VALUES
      ('event_team_by_duplicate_id', 'sport_indoor_volleyball_duplicate'),
      ('event_team_exact_id_precedence', 'Basketball'),
      ('event_team_by_name', ' BASKETBALL ');
    INSERT INTO "Teams" ("id", "sport") VALUES
      ('canonical_team_by_duplicate_id', 'sport_indoor_volleyball_duplicate'),
      ('canonical_team_exact_id_precedence', 'Basketball'),
      ('canonical_team_by_name', ' BASKETBALL ');
    INSERT INTO "Organizations" ("id", "sports") VALUES
      ('organization_1', ARRAY['Other', ' indoor volleyball ', 'Indoor Volleyball', 'Basketball', ' basketball ', 'Tail']);
  `);

  const migration = await readFile(migrationPath, 'utf8');
  await client.query(migration);

  const sports = await client.query(`
    SELECT
      "id",
      "name",
      "usePointsForWin",
      "usePointsForDraw",
      "matchRulesTemplate"
    FROM "Sports"
    ORDER BY "id"
  `);
  assert.deepEqual(sports.rows, [
    {
      id: 'Indoor Volleyball',
      name: 'Indoor Volleyball',
      usePointsForWin: true,
      usePointsForDraw: false,
      matchRulesTemplate: { scoringModel: 'SETS' },
    },
    {
      id: 'Other',
      name: 'Other',
      usePointsForWin: null,
      usePointsForDraw: null,
      matchRulesTemplate: null,
    },
    {
      id: 'sport_basketball_rich',
      name: 'Basketball',
      usePointsForWin: true,
      usePointsForDraw: false,
      matchRulesTemplate: { scoringModel: 'PERIODS' },
    },
  ]);

  const events = await client.query('SELECT "id", "sportId" FROM "Events" ORDER BY "id"');
  assert.deepEqual(events.rows, [
    { id: 'event_basketball', sportId: 'sport_basketball_rich' },
    { id: 'event_volleyball', sportId: 'Indoor Volleyball' },
  ]);
  assert.equal(
    (await client.query('SELECT "sportId" FROM "Divisions" WHERE "id" = $1', ['division_volleyball'])).rows[0].sportId,
    'Indoor Volleyball',
  );
  assert.equal(
    (await client.query('SELECT "sportId" FROM "EventTemplates" WHERE "id" = $1', ['template_volleyball'])).rows[0].sportId,
    'Indoor Volleyball',
  );
  assert.deepEqual(
    (await client.query('SELECT "sportIds" FROM "Fields" WHERE "id" = $1', ['field_1'])).rows[0].sportIds,
    ['Other', 'Indoor Volleyball', 'sport_basketball_rich'],
  );
  assert.deepEqual(
    (await client.query('SELECT "id", "sport" FROM "EventTeams" ORDER BY "id"')).rows,
    [
      { id: 'event_team_by_duplicate_id', sport: 'Indoor Volleyball' },
      { id: 'event_team_by_name', sport: 'Basketball' },
      { id: 'event_team_exact_id_precedence', sport: 'Indoor Volleyball' },
    ],
  );
  assert.deepEqual(
    (await client.query('SELECT "id", "sport" FROM "Teams" ORDER BY "id"')).rows,
    [
      { id: 'canonical_team_by_duplicate_id', sport: 'Indoor Volleyball' },
      { id: 'canonical_team_by_name', sport: 'Basketball' },
      { id: 'canonical_team_exact_id_precedence', sport: 'Indoor Volleyball' },
    ],
  );
  assert.deepEqual(
    (await client.query('SELECT "sports" FROM "Organizations" WHERE "id" = $1', ['organization_1'])).rows[0].sports,
    ['Other', 'Indoor Volleyball', 'Basketball', 'Tail'],
  );

  await client.query('BEGIN');
  await expectRejectedInsert('duplicate_case', 'INDOOR VOLLEYBALL', 'Sports_name_ci_key', 1);
  await expectRejectedInsert('duplicate_whitespace', ' Indoor Volleyball ', 'Sports_name_nonblank_check', 2);
  await expectRejectedInsert('blank_name', '   ', 'Sports_name_nonblank_check', 3);
  await client.query('COMMIT');

  await client.query('SET search_path TO public');
  await client.query(`CREATE SCHEMA ${quotedConflictSchema}`);
  await client.query(`SET search_path TO ${quotedConflictSchema}`);
  await createFixtureTables();
  await client.query(`
    INSERT INTO "Sports" ("id", "createdAt", "name", "usePointsForWin") VALUES
      ('Conflict Sport', '2024-01-01', 'Conflict Sport', TRUE),
      ('conflict_sport_duplicate', '2025-01-01', ' conflict sport ', FALSE);
  `);

  let conflictRejection;
  try {
    await client.query(migration);
  } catch (error) {
    conflictRejection = error;
    await client.query('ROLLBACK');
  }

  assert.ok(conflictRejection, 'Expected conflicting duplicate configuration to abort the migration.');
  assert.equal(conflictRejection.code, '23514');
  assert.match(
    conflictRejection.message,
    /Conflicting non-null Sports configuration for canonical name "conflict sport" in field "usePointsForWin"\./,
  );
  assert.match(conflictRejection.detail ?? '', /Distinct values: \[false, true\]/);

  console.log('canonical sport migration fixture passed');
} finally {
  if (connected) {
    await client.query('ROLLBACK').catch(() => undefined);
    await client.query('SET search_path TO public').catch(() => undefined);
    await client.query(`DROP SCHEMA IF EXISTS ${quotedFixtureSchema} CASCADE`).catch(() => undefined);
    await client.query(`DROP SCHEMA IF EXISTS ${quotedConflictSchema} CASCADE`).catch(() => undefined);
    await client.end();
  }
}
