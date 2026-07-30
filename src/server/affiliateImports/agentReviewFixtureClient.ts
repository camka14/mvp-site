import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { ScrapePageClient, ScrapedPage } from './types';

const fixtureManifestSchema = z.object({
  schemaVersion: z.literal(1),
  pages: z.array(z.object({
    url: z.string().url(),
    finalUrl: z.string().url(),
    statusCode: z.number().int().min(100).max(599),
    file: z.string().trim().min(1),
    sha256: z.string().regex(/^[a-f0-9]{64}$/i),
    byteLength: z.number().int().nonnegative().optional(),
    fetchedAt: z.string().datetime({ offset: true }).optional(),
  }).strict()).min(1),
}).strict();

const MAX_FIXTURE_BYTES = 4 * 1024 * 1024;

export class AffiliateAgentReviewFixtureClient implements ScrapePageClient {
  private readonly directory: string;
  private manifestPromise: Promise<z.infer<typeof fixtureManifestSchema>> | null = null;

  constructor(directory: string) {
    this.directory = path.resolve(directory);
  }

  private async manifest(): Promise<z.infer<typeof fixtureManifestSchema>> {
    this.manifestPromise ??= fs.readFile(
      path.join(this.directory, 'pages.json'),
      'utf8',
    ).then((value) => fixtureManifestSchema.parse(JSON.parse(value)));
    return this.manifestPromise;
  }

  async fetchPage(params: {
    url: string;
    renderJavascript?: boolean;
    waitMs?: number;
  }): Promise<ScrapedPage> {
    const manifest = await this.manifest();
    const page = manifest.pages.find((candidate) => candidate.url === params.url);
    if (!page) throw new Error(`Review fixture has no exact page for URL: ${params.url}`);
    const target = path.resolve(this.directory, page.file);
    if (!target.startsWith(`${this.directory}${path.sep}`)) {
      throw new Error(`Review fixture path escapes its directory: ${page.file}`);
    }
    const stats = await fs.stat(target);
    if (!stats.isFile() || stats.size > MAX_FIXTURE_BYTES) {
      throw new Error(`Review fixture file is missing, invalid, or too large: ${page.file}`);
    }
    const body = await fs.readFile(target, 'utf8');
    const actualHash = createHash('sha256').update(body).digest('hex');
    if (actualHash !== page.sha256.toLowerCase()) {
      throw new Error(`Review fixture hash mismatch for ${page.file}.`);
    }
    return {
      url: page.url,
      finalUrl: page.finalUrl,
      statusCode: page.statusCode,
      body,
      fetchedAt: page.fetchedAt ?? new Date().toISOString(),
    };
  }
}
