/**
 * Rehydrates the local storage objects for the scoped affiliate organizations.
 *
 * The local club copy may contain File rows whose storage objects were not
 * copied with the database. Live is read-only here; the downloaded bytes are
 * validated before they are written to local storage.
 *
 * Usage:
 *   npm run affiliate:logos:repair-local
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { Client } from 'pg';
import dotenv from 'dotenv';
import sharp from 'sharp';

import { writeLocalFile } from '../src/lib/localStorageProvider';

dotenv.config({ path: '.env.local', override: false, quiet: true });
dotenv.config({ path: '.env', override: false, quiet: true });

type LogoScope = {
  organizationId: string;
  sourceKey: string;
};

const scopedLogos: LogoScope[] = [
  ['affiliate_org_ceva_club_directory_axiom_vbc', 'site-axiomvolleyballclub-com'],
  ['affiliate_org_ceva_club_directory_blues_vbc', 'site-bluesvbclub-usetopscore-com'],
  ['affiliate_org_ceva_club_directory_cherry_city_juniors_vbc', 'site-cherrycityjrsvb-sportngin-com'],
  ['affiliate_org_oregon_youth_soccer_find_a_club_coast_to_coast_futbol_academy', 'site-ccfutbolacademy-com'],
  ['affiliate_org_ceva_club_directory_crushers_vbc', 'site-sportsengine-com'],
  ['affiliate_org_ceva_club_directory_eastern_oregon_vbc', 'site-easternoregonvbc-com'],
  ['affiliate_org_ceva_club_directory_gorge_juniors_vbc', 'site-gorgejuniorsvolleyball-com'],
  ['affiliate_org_ceva_club_directory_happy_valley_volleyball_club_hvvc', 'site-hvvcvolleyballclub-com'],
  ['affiliate_org_oregon_state_hockey_youth_directory_lane_amateur_hockey_association', 'site-laha-org'],
  ['affiliate_org_oregon_youth_soccer_find_a_club_lincoln_youth_soccer', 'site-lincolnyouthsoccer-org'],
  ['affiliate_org_oregon_youth_soccer_find_a_club_mid_valley_soccer_club', 'site-midvalleysoccerclub-org'],
  ['affiliate_org_oregon_youth_soccer_find_a_club_oregon_surf', 'site-oregonsurf-org'],
  ['affiliate_org_oregon_youth_soccer_find_a_club_reynolds_youth_soccer_club', 'site-tshq-bluesombrero-com'],
  ['affiliate_org_oregon_youth_soccer_find_a_club_rogue_united_fc', 'site-rogueunitedfc-com'],
  ['affiliate_org_oregon_state_hockey_youth_directory_rose_city_hockey_club', 'site-rosecityhockeyclub-com'],
  ['affiliate_org_oregon_youth_soccer_find_a_club_sherwood_youth_soccer_club', 'site-sherwoodsoccer-org'],
  ['affiliate_org_oregon_youth_soccer_find_a_club_siuslaw_youth_soccer_association', 'site-siuslawsoccer-com'],
  ['affiliate_org_oregon_state_hockey_youth_directory_team_oregon', 'site-oregonstatehockey-com'],
  ['affiliate_org_oregon_youth_soccer_find_a_club_union_county_youth_soccer_association', 'site-leagues-bluesombrero-com'],
  ['affiliate_org_ceva_club_directory_vancouver_vbc', 'site-vancouvervolleyballclub-teamsnapsites-com'],
  ['affiliate_org_oregon_youth_soccer_find_a_club_whk_soccer_club', 'site-whksoccer-org'],
  ['affiliate_org_oregon_state_hockey_youth_directory_winterhawks_jr_hockey', 'site-winterhawksjrhockey-com'],
  ['affiliate_org_oregon_youth_soccer_find_a_club_woodburn_fc', 'site-clubs-bluesombrero-com'],
  ['affiliate_org_oregon_youth_soccer_find_a_club_yamhill_carlton_soccer_club', 'site-ycsoccerclub-com'],
  ['affiliate_org_oregon_youth_soccer_find_a_club_fc_piamonte', 'site-fcpiamonte-org'],
].map(([organizationId, sourceKey]) => ({ organizationId, sourceKey }));

const requiredUrl = (name: 'DATABASE_URL' | 'DATABASE_URL_LIVE'): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
};

const withoutSslMode = (value: string): string => {
  const url = new URL(value);
  url.searchParams.delete('sslmode');
  return url.toString();
};

const quoteIdentifier = (value: string): string => `"${value.replace(/"/g, '""')}"`;

const LIGHT_LOGO_BACKGROUND = '#ffffff';
const DARK_LOGO_BACKGROUND = '#172033';

const chooseLogoBackground = async (input: Buffer): Promise<string> => {
  const { data, info } = await sharp(input, { animated: false })
    .rotate()
    .resize({ width: 96, height: 96, fit: 'inside', withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let visible = 0;
  let luminanceTotal = 0;
  let darkPixels = 0;
  for (let index = 0; index < data.length; index += info.channels) {
    const alpha = data[index + 3] ?? 255;
    if (alpha < 32) continue;
    const red = data[index] ?? 0;
    const green = data[index + 1] ?? 0;
    const blue = data[index + 2] ?? 0;
    const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    visible += 1;
    luminanceTotal += luminance;
    if (luminance < 96) darkPixels += 1;
  }
  if (!visible) return LIGHT_LOGO_BACKGROUND;
  const averageLuminance = luminanceTotal / visible;
  return averageLuminance > 210 && darkPixels / visible < 0.15
    ? DARK_LOGO_BACKGROUND
    : LIGHT_LOGO_BACKGROUND;
};

const normalizeOfficialLogo = async (input: Buffer): Promise<{ data: Buffer; background: string }> => {
  const background = await chooseLogoBackground(input);
  const trimmed = await sharp(input, { animated: false })
    .rotate()
    .flatten({ background })
    .trim({ background, threshold: 12 })
    .png()
    .toBuffer()
    .catch(async () => sharp(input, { animated: false }).rotate().flatten({ background }).png().toBuffer());
  const metadata = await sharp(trimmed).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  const aspectRatio = width && height ? width / height : 1;
  const target = aspectRatio >= 2.4
    ? { width: 680, height: 500 }
    : aspectRatio >= 1.5
      ? { width: 720, height: 560 }
      : aspectRatio <= 0.55
        ? { width: 500, height: 760 }
        : aspectRatio <= 0.8
          ? { width: 560, height: 760 }
          : { width: 760, height: 760 };
  const logo = await sharp(trimmed)
    .resize({ width: target.width, height: target.height, fit: 'inside', withoutEnlargement: false })
    .png()
    .toBuffer();
  const logoMetadata = await sharp(logo).metadata();
  const logoWidth = logoMetadata.width ?? target.width;
  const logoHeight = logoMetadata.height ?? target.height;
  const data = await sharp({
    create: { width: 1024, height: 1024, channels: 3, background },
  })
    .composite([{
      input: logo,
      left: Math.round((1024 - logoWidth) / 2),
      top: Math.round((1024 - logoHeight) / 2),
    }])
    .removeAlpha()
    .png()
    .toBuffer();
  return { data, background };
};

const main = async () => {
  const localClient = new Client({ connectionString: withoutSslMode(requiredUrl('DATABASE_URL')), ssl: false });
  const liveClient = new Client({
    connectionString: withoutSslMode(requiredUrl('DATABASE_URL_LIVE')),
    ssl: { rejectUnauthorized: false },
  });
  const liveBaseUrl = (process.env.LIVE_APP_BASE_URL?.trim() || 'https://bracket-iq.com').replace(/\/+$/, '');
  const outputPath = path.join(process.cwd(), 'output', 'scoped-affiliate-local-logo-repair.json');
  const report: Array<Record<string, unknown>> = [];

  await Promise.all([localClient.connect(), liveClient.connect()]);
  try {
    for (const scope of scopedLogos) {
      const [localResult, liveResult] = await Promise.all([
        localClient.query(
          `SELECT o.id, o.name, o."logoId", f.id AS "fileId", f."originalName", f."mimeType", f."organizationId"
           FROM "Organizations" o
           LEFT JOIN "File" f ON f.id = o."logoId"
           WHERE o.id = $1`,
          [scope.organizationId],
        ),
        liveClient.query(
          `SELECT o.id, o.name, o."logoId", f.id AS "fileId", f."originalName", f."mimeType", f."organizationId"
           FROM "Organizations" o
           LEFT JOIN "File" f ON f.id = o."logoId"
           WHERE o.id = $1`,
          [scope.organizationId],
        ),
      ]);
      const local = localResult.rows[0];
      const live = liveResult.rows[0];
      if (!local || !live || !live.fileId) {
        throw new Error(`Missing local/live organization or logo row for ${scope.organizationId}.`);
      }

      const response = await fetch(`${liveBaseUrl}/api/files/${encodeURIComponent(live.fileId)}`, {
        headers: { 'user-agent': 'BracketIQ local affiliate logo repair' },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} while downloading ${live.fileId}.`);
      const sourceData = Buffer.from(await response.arrayBuffer());
      const normalized = await normalizeOfficialLogo(sourceData);
      const data = normalized.data;
      const metadata = await sharp(data).metadata();
      if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) {
        throw new Error(
          `${scope.organizationId} logo is not an opaque 1024x1024 image: ${JSON.stringify({
            width: metadata.width,
            height: metadata.height,
            hasAlpha: metadata.hasAlpha,
          })}`,
        );
      }

      const stored = await writeLocalFile(
        data,
        live.originalName || `${scope.organizationId}-logo.png`,
        scope.organizationId,
      );
      await localClient.query(
        `UPDATE ${quoteIdentifier('File')}
         SET "path" = $1, "bucket" = NULL, "originalName" = $2, "mimeType" = $3,
             "sizeBytes" = $4, "updatedAt" = NOW()
         WHERE id = $5`,
        [stored.relativePath, live.originalName || `${scope.organizationId}-logo.png`, response.headers.get('content-type') || live.mimeType || 'image/png', data.length, local.fileId],
      );
      report.push({
        organizationId: scope.organizationId,
        organizationName: local.name,
        sourceKey: scope.sourceKey,
        fileId: local.fileId,
        localPath: stored.relativePath,
        bytes: data.length,
        dimensions: [metadata.width, metadata.height],
        opaque: !metadata.hasAlpha,
        background: normalized.background,
        source: 'live-file-endpoint-normalized-locally',
      });
    }
  } finally {
    await Promise.allSettled([localClient.end(), liveClient.end()]);
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify({ repairedAt: new Date().toISOString(), report }, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ repaired: report.length, outputPath }, null, 2));
};

main().catch((error) => {
  console.error('[affiliate:logos:repair-local] failed', error);
  process.exitCode = 1;
});
