/** @jest-environment node */

import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AffiliateAgentReviewFixtureClient } from '../agentReviewFixtureClient';

describe('affiliate agent review fixture client', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'affiliate-review-fixture-'));
  });

  afterEach(async () => {
    await fs.rm(directory, { recursive: true, force: true });
  });

  const writeFixture = async (body: string, file = 'events.html') => {
    await fs.writeFile(path.join(directory, file), body, 'utf8');
    await fs.writeFile(path.join(directory, 'pages.json'), JSON.stringify({
      schemaVersion: 1,
      pages: [{
        url: 'https://fixture.invalid/events',
        finalUrl: 'https://fixture.invalid/events',
        statusCode: 200,
        file,
        sha256: createHash('sha256').update(body).digest('hex'),
        fetchedAt: '2026-07-29T20:00:00.000Z',
      }],
    }), 'utf8');
  };

  it('returns only an exact hash-verified local page', async () => {
    await writeFixture('<main>Fixture</main>');
    const client = new AffiliateAgentReviewFixtureClient(directory);
    await expect(client.fetchPage({
      url: 'https://fixture.invalid/events',
    })).resolves.toEqual(expect.objectContaining({
      statusCode: 200,
      body: '<main>Fixture</main>',
      fetchedAt: '2026-07-29T20:00:00.000Z',
    }));
    await expect(client.fetchPage({
      url: 'https://fixture.invalid/other',
    })).rejects.toThrow('no exact page');
  });

  it('rejects tampering and paths outside the fixture directory', async () => {
    await writeFixture('<main>Fixture</main>');
    await fs.writeFile(path.join(directory, 'events.html'), 'changed', 'utf8');
    await expect(new AffiliateAgentReviewFixtureClient(directory).fetchPage({
      url: 'https://fixture.invalid/events',
    })).rejects.toThrow('hash mismatch');

    await fs.writeFile(path.join(directory, 'pages.json'), JSON.stringify({
      schemaVersion: 1,
      pages: [{
        url: 'https://fixture.invalid/events',
        finalUrl: 'https://fixture.invalid/events',
        statusCode: 200,
        file: '../outside.html',
        sha256: createHash('sha256').update('outside').digest('hex'),
      }],
    }), 'utf8');
    await expect(new AffiliateAgentReviewFixtureClient(directory).fetchPage({
      url: 'https://fixture.invalid/events',
    })).rejects.toThrow('escapes');
  });
});
