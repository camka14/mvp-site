/**
 * Builds an affiliate org logo fit preview sheet.
 *
 * The script fetches all affiliate org logos from the configured DB/storage,
 * writes source and opaque candidate assets under output/affiliate-logo-fit,
 * and generates an HTML contact sheet that compares the current raw logo
 * against a generated replacement in the major BracketIQ card/detail surfaces.
 */
import dotenv from 'dotenv';
import { promises as fs } from 'fs';
import path from 'path';
import { Readable } from 'stream';
import sharp from 'sharp';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

const useLive = process.argv.includes('--live');
const outputRootArg = process.argv.find((arg) => arg.startsWith('--output='));

if (useLive) {
  const liveUrl = process.env.DATABASE_URL_LIVE;
  if (!liveUrl) {
    throw new Error('DATABASE_URL_LIVE is missing.');
  }
  process.env.DATABASE_URL = liveUrl;
  process.env.STORAGE_PROVIDER = 'spaces';
  process.env.PG_SSL_REJECT_UNAUTHORIZED = 'false';
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

type PrismaClientInstance = typeof import('../src/lib/prisma').prisma;
type StorageProviderInstance = ReturnType<typeof import('../src/lib/storageProvider').getStorageProvider>;

type AffiliateLogoRow = {
  id: string;
  name: string;
  status: string | null;
  publicSlug: string | null;
  website: string | null;
  logoId: string | null;
  logo?: {
    id: string;
    originalName: string;
    mimeType: string | null;
    path: string;
    bucket: string | null;
    sizeBytes: number | null;
  } | null;
};

type AffiliateLogoFile = NonNullable<AffiliateLogoRow['logo']>;

type LogoReportRow = {
  orgId: string;
  orgName: string;
  logoId: string;
  sourceFile: string;
  candidateFile: string;
  candidateBackground: string | null;
  sourceWidth: number | null;
  sourceHeight: number | null;
  sourceAspectRatio: number | null;
  hasAlpha: boolean;
  warnings: string[];
};

const outputRoot = outputRootArg
  ? path.resolve(process.cwd(), outputRootArg.slice('--output='.length))
  : path.resolve(process.cwd(), 'output/affiliate-logo-fit');
const assetsDir = path.join(outputRoot, 'assets');
const PLATFORM_LIGHT_BG = '#ffffff';
const PLATFORM_DARK_BG = '#000000';
const LIGHT_LOGO_BG = '#f8fafc';
const DARK_CARD_BG = '#111827';
const DARK_LOGO_BG = '#172033';

let prisma: PrismaClientInstance | undefined;
let storage: StorageProviderInstance | undefined;

const loadAppModules = async () => {
  ({ prisma } = await import('../src/lib/prisma'));
  const { getStorageProvider } = await import('../src/lib/storageProvider');
  storage = getStorageProvider();
};

const streamToBuffer = async (stream: Readable): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
};

const slugify = (value: string): string => (
  value
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    || 'affiliate-org'
);

const escapeHtml = (value: string): string => (
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
);

type LogoTone = {
  luma: number;
  brightRatio: number;
  darkRatio: number;
};

const getVisibleLogoTone = async (input: Buffer): Promise<LogoTone | null> => {
  const { data, info } = await sharp(input, { animated: false })
    .rotate()
    .resize({ width: 180, height: 180, fit: 'inside', withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let lumaTotal = 0;
  let alphaTotal = 0;
  let visiblePixels = 0;
  let brightPixels = 0;
  let darkPixels = 0;
  for (let index = 0; index < data.length; index += info.channels) {
    const alpha = data[index + 3] ?? 255;
    if (alpha < 20) continue;
    const red = data[index] ?? 0;
    const green = data[index + 1] ?? 0;
    const blue = data[index + 2] ?? 0;
    const luma = (0.2126 * red) + (0.7152 * green) + (0.0722 * blue);
    lumaTotal += luma * alpha;
    alphaTotal += alpha;
    visiblePixels += 1;
    if (luma > 205) brightPixels += 1;
    if (luma < 55) darkPixels += 1;
  }

  if (!alphaTotal || !visiblePixels) return null;
  return {
    luma: lumaTotal / alphaTotal,
    brightRatio: brightPixels / visiblePixels,
    darkRatio: darkPixels / visiblePixels,
  };
};

const getSafeBackground = async (input: Buffer, metadata: sharp.Metadata): Promise<string> => {
  if (!metadata.hasAlpha) {
    return LIGHT_LOGO_BG;
  }
  const tone = await getVisibleLogoTone(input).catch(() => null);
  if (!tone) {
    return LIGHT_LOGO_BG;
  }
  if (tone.brightRatio > 0.12 || (tone.luma > 172 && tone.darkRatio < 0.45)) {
    return DARK_LOGO_BG;
  }
  return LIGHT_LOGO_BG;
};

const writeOpaqueCandidate = async (
  input: Buffer,
  outputPath: string,
): Promise<{ metadata: sharp.Metadata; background: string }> => {
  const source = sharp(input, { animated: false });
  const metadata = await source.metadata();
  const background = await getSafeBackground(input, metadata);
  const trimmed = await sharp(input, { animated: false })
    .rotate()
    .trim({ background, threshold: 12 })
    .png()
    .toBuffer()
    .catch(async () => sharp(input, { animated: false }).rotate().png().toBuffer());

  const logoBuffer = await sharp(trimmed)
    .resize({
      width: 1280,
      height: 540,
      fit: 'inside',
      withoutEnlargement: false,
      background,
    })
    .png()
    .toBuffer();
  const logoMetadata = await sharp(logoBuffer).metadata();
  const logoWidth = logoMetadata.width ?? 1040;

  await sharp({
    create: {
      width: 1600,
      height: 1000,
      channels: 4,
      background,
    },
  })
    .composite([
      {
        input: Buffer.from(`
          <svg width="1600" height="1000" viewBox="0 0 1600 1000" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <radialGradient id="glow" cx="50%" cy="30%" r="72%">
                <stop offset="0%" stop-color="#ffffff" stop-opacity="${background === DARK_LOGO_BG ? '0.10' : '0.40'}"/>
                <stop offset="58%" stop-color="#ffffff" stop-opacity="0"/>
              </radialGradient>
              <linearGradient id="vignette" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#ffffff" stop-opacity="${background === DARK_LOGO_BG ? '0.03' : '0.16'}"/>
                <stop offset="100%" stop-color="#0f172a" stop-opacity="${background === DARK_LOGO_BG ? '0.24' : '0.10'}"/>
              </linearGradient>
            </defs>
            <rect width="1600" height="1000" fill="url(#glow)"/>
            <rect width="1600" height="1000" fill="url(#vignette)"/>
          </svg>
        `),
        gravity: 'center',
      },
      {
        input: logoBuffer,
        top: 145,
        left: Math.round((1600 - logoWidth) / 2),
      },
    ])
    .png()
    .toFile(outputPath);

  return { metadata, background };
};

const buildWarnings = (metadata: sharp.Metadata): string[] => {
  const warnings: string[] = [];
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (!width || !height) {
    warnings.push('missing dimensions');
    return warnings;
  }
  if (width < 240 || height < 120) {
    warnings.push(`low source resolution ${width}x${height}`);
  }
  const aspect = width / height;
  if (aspect > 4) {
    warnings.push(`very wide source aspect ${aspect.toFixed(2)}:1`);
  }
  if (aspect < 0.35) {
    warnings.push(`very tall source aspect ${aspect.toFixed(2)}:1`);
  }
  if (metadata.hasAlpha) {
    warnings.push('transparent source; current rendering changes by light/dark platform background');
  }
  return warnings;
};

const buildSurface = (
  label: string,
  className: string,
  sourceSrc: string,
  candidateSrc: string,
  orgName: string,
) => `
  <div class="surface-set ${className}">
    <h3>${label}</h3>
    <div class="preview-stack">
      <div>
        <span class="mode-label">Current · light</span>
        <div class="preview-frame raw-frame raw-light ${className}">
          ${sourceSrc
            ? `<img src="${sourceSrc}" alt="${escapeHtml(orgName)} raw logo on ${label} light preview">`
            : '<div class="missing-surface">Missing source</div>'}
          <div class="surface-scrim"></div>
          <div class="surface-copy"><strong>${escapeHtml(orgName)}</strong></div>
        </div>
      </div>
      <div>
        <span class="mode-label">Current · dark</span>
        <div class="preview-frame raw-frame raw-dark ${className}">
          ${sourceSrc
            ? `<img src="${sourceSrc}" alt="${escapeHtml(orgName)} raw logo on ${label} dark preview">`
            : '<div class="missing-surface">Missing source</div>'}
          <div class="surface-scrim"></div>
          <div class="surface-copy"><strong>${escapeHtml(orgName)}</strong></div>
        </div>
      </div>
      <div>
        <span class="mode-label">Opaque candidate</span>
        <div class="preview-frame candidate-frame ${className}">
          ${candidateSrc
            ? `<img src="${candidateSrc}" alt="${escapeHtml(orgName)} opaque candidate on ${label} preview">`
            : '<div class="missing-surface">Missing candidate</div>'}
          <div class="surface-scrim"></div>
          <div class="surface-copy"><strong>${escapeHtml(orgName)}</strong></div>
        </div>
      </div>
    </div>
  </div>
`;

const buildHtml = (rows: LogoReportRow[]) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Affiliate Logo Fit Preview</title>
  <style>
    :root {
      color-scheme: light;
      --ink: #172033;
      --muted: #667085;
      --line: #d8e0ea;
      --panel: #f3f6fa;
      --safe-bg: ${LIGHT_LOGO_BG};
      --brand: #204f7d;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--ink);
      background: #ffffff;
    }
    header {
      position: sticky;
      top: 0;
      z-index: 10;
      padding: 20px 28px;
      border-bottom: 1px solid var(--line);
      background: rgba(255,255,255,.94);
      backdrop-filter: blur(10px);
    }
    h1 {
      margin: 0 0 6px;
      font-size: 28px;
      line-height: 1.1;
      letter-spacing: 0;
    }
    header p {
      margin: 0;
      color: var(--muted);
      font-size: 14px;
    }
    main {
      display: grid;
      gap: 22px;
      padding: 24px 28px 56px;
    }
    .org-row {
      display: grid;
      grid-template-columns: 260px minmax(0, 1fr);
      gap: 18px;
      align-items: start;
      padding: 18px;
      border: 1px solid var(--line);
      border-radius: 14px;
      background: #fff;
      box-shadow: 0 8px 24px rgba(15, 23, 42, .05);
    }
    .meta h2 {
      margin: 0 0 8px;
      font-size: 18px;
      letter-spacing: 0;
    }
    .meta dl {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 4px 10px;
      margin: 0;
      font-size: 12px;
      color: var(--muted);
    }
    .meta dt { font-weight: 700; color: #475467; }
    .raw-logo {
      display: grid;
      place-items: center;
      width: 220px;
      height: 140px;
      margin: 14px 0;
      border: 1px dashed #cbd5e1;
      border-radius: 10px;
      background:
        linear-gradient(45deg, #edf2f7 25%, transparent 25%),
        linear-gradient(-45deg, #edf2f7 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, #edf2f7 75%),
        linear-gradient(-45deg, transparent 75%, #edf2f7 75%);
      background-size: 18px 18px;
      background-position: 0 0, 0 9px, 9px -9px, -9px 0;
      overflow: hidden;
    }
    .raw-logo img {
      max-width: 92%;
      max-height: 82%;
      object-fit: contain;
    }
    .missing-logo,
    .missing-surface {
      display: grid;
      place-items: center;
      width: 100%;
      height: 100%;
      padding: 16px;
      text-align: center;
      color: #9a3412;
      background: #fff7ed;
      font-size: 12px;
      font-weight: 800;
    }
    .missing-surface {
      position: absolute;
      inset: 0;
      color: #ffffff;
      background: ${DARK_CARD_BG};
    }
    .warnings {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 10px;
    }
    .warning {
      padding: 4px 8px;
      border-radius: 999px;
      background: #fff7ed;
      color: #9a3412;
      font-size: 11px;
      font-weight: 700;
    }
    .surfaces {
      display: grid;
      grid-template-columns: repeat(5, minmax(190px, 1fr));
      gap: 16px;
      align-items: start;
    }
    .surface-set {
      min-width: 0;
      padding: 10px;
      border: 1px solid var(--line);
      border-radius: 12px;
      background: #f8fafc;
    }
    .surface-set h3 {
      margin: 0 0 8px;
      font-size: 13px;
      line-height: 1.2;
      letter-spacing: 0;
    }
    .preview-stack {
      display: grid;
      gap: 8px;
    }
    .mode-label {
      display: block;
      margin: 0 0 3px;
      color: #667085;
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: .04em;
    }
    .preview-frame {
      position: relative;
      overflow: hidden;
      border-radius: 14px;
      border: 1px solid rgba(15, 23, 42, .1);
      background: var(--platform-bg, var(--safe-bg));
      box-shadow: 0 8px 18px rgba(15, 23, 42, .08);
    }
    .preview-frame img {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .raw-light {
      --platform-bg: ${PLATFORM_LIGHT_BG};
    }
    .raw-dark {
      --platform-bg: ${PLATFORM_DARK_BG};
    }
    .candidate-frame {
      --platform-bg: transparent;
    }
    .surface-scrim {
      position: absolute;
      inset: 0;
      background: linear-gradient(180deg, rgba(17,24,39,.02) 0%, rgba(17,24,39,.08) 42%, rgba(17,24,39,.76) 100%);
    }
    .surface-copy {
      position: absolute;
      left: 9px;
      right: 9px;
      bottom: 8px;
      display: grid;
      gap: 6px;
      color: #fff;
      text-shadow: 0 1px 2px rgba(0,0,0,.22);
    }
    .surface-copy strong {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 12px;
      line-height: 1.12;
      letter-spacing: 0;
    }
    .ios-card.preview-frame,
    .android-card.preview-frame {
      aspect-ratio: 350 / 430;
    }
    .android-card.preview-frame {
      border-radius: 10px;
    }
    .mobile-detail.preview-frame {
      aspect-ratio: 390 / 220;
      border-radius: 24px 24px 0 0;
    }
    .site-card.preview-frame {
      aspect-ratio: 420 / 176;
      border-radius: 8px 8px 0 0;
    }
    .site-detail.preview-frame {
      aspect-ratio: 1200 / 420;
      border-radius: 0;
    }
    .ios-card .surface-scrim,
    .android-card .surface-scrim {
      background:
        linear-gradient(180deg, rgba(15,23,42,0) 0%, rgba(15,23,42,.08) 40%, rgba(15,23,42,.74) 100%),
        linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(255,255,255,.18) 55%, rgba(255,255,255,.10) 100%);
    }
    .pill {
      justify-self: start;
      padding: 5px 9px;
      border-radius: 999px;
      background: rgba(255,255,255,.88);
      color: #172033;
      text-shadow: none;
      font-weight: 800;
    }
    @media (max-width: 1400px) {
      .org-row { grid-template-columns: 1fr; }
      .surfaces { grid-template-columns: repeat(3, minmax(190px, 1fr)); }
    }
  </style>
</head>
<body>
  <header>
    <h1>Affiliate Logo Fit Preview</h1>
    <p>${rows.length} affiliate org logos. Current previews render the raw logo with the same cover crop used by iOS, Android, and web; light/dark rows show transparent-logo background differences. Opaque candidates are generated replacement images rendered through the same crop.</p>
  </header>
  <main>
    ${rows.map((row) => {
      const hasPreview = Boolean(row.sourceFile && row.candidateFile);
      const source = hasPreview ? `assets/${row.sourceFile}` : '';
      const candidate = hasPreview ? `assets/${row.candidateFile}` : '';
      const aspect = row.sourceAspectRatio ? row.sourceAspectRatio.toFixed(2) : 'n/a';
      return `
        <section class="org-row" data-org="${escapeHtml(row.orgId)}">
          <div class="meta">
            <h2>${escapeHtml(row.orgName)}</h2>
            <dl>
              <dt>Org</dt><dd>${escapeHtml(row.orgId)}</dd>
              <dt>Logo</dt><dd>${escapeHtml(row.logoId)}</dd>
              <dt>Source</dt><dd>${row.sourceWidth ?? '?'} x ${row.sourceHeight ?? '?'} (${aspect}:1)</dd>
              <dt>Alpha</dt><dd>${row.hasAlpha ? 'yes' : 'no'}</dd>
            </dl>
            <div class="raw-logo">
              ${source
                ? `<img src="${source}" alt="${escapeHtml(row.orgName)} raw logo">`
                : '<div class="missing-logo">Missing local logo object</div>'}
            </div>
            <div class="warnings">
              ${row.warnings.length
                ? row.warnings.map((warning) => `<span class="warning">${escapeHtml(warning)}</span>`).join('')
                : '<span class="warning" style="background:#ecfdf3;color:#027a48">no automatic warnings</span>'}
            </div>
          </div>
          <div class="surfaces">
            ${buildSurface('iOS card', 'ios-card', source, candidate, row.orgName)}
            ${buildSurface('Android card', 'android-card', source, candidate, row.orgName)}
            ${buildSurface('Mobile detail', 'mobile-detail', source, candidate, row.orgName)}
            ${buildSurface('Site card', 'site-card', source, candidate, row.orgName)}
            ${buildSurface('Site detail', 'site-detail', source, candidate, row.orgName)}
          </div>
        </section>
      `;
    }).join('')}
  </main>
</body>
</html>
`;

const main = async () => {
  await loadAppModules();
  await fs.rm(outputRoot, { recursive: true, force: true });
  await fs.mkdir(assetsDir, { recursive: true });

  const organizations = await (prisma as any).organizations.findMany({
    where: {
      id: { startsWith: 'affiliate_org_' },
      logoId: { not: null },
    },
    select: {
      id: true,
      name: true,
      status: true,
      publicSlug: true,
      website: true,
      logoId: true,
    },
    orderBy: { name: 'asc' },
  });
  const files = await (prisma as any).file.findMany({
    where: {
      id: {
        in: organizations
          .map((org: AffiliateLogoRow) => org.logoId)
          .filter((id: string | null): id is string => Boolean(id)),
      },
    },
    select: {
      id: true,
      originalName: true,
      mimeType: true,
      path: true,
      bucket: true,
      sizeBytes: true,
    },
  });
  const fileById = new Map<string, AffiliateLogoFile>(
    (files as AffiliateLogoFile[]).map((file) => [file.id, file]),
  );

  const report: LogoReportRow[] = [];
  for (const org of organizations as AffiliateLogoRow[]) {
    if (!org.logoId) continue;
    const logo = fileById.get(org.logoId);
    if (!logo) {
      report.push({
        orgId: org.id,
        orgName: org.name,
        logoId: org.logoId,
        sourceFile: '',
        candidateFile: '',
        candidateBackground: null,
        sourceWidth: null,
        sourceHeight: null,
        sourceAspectRatio: null,
        hasAlpha: false,
        warnings: ['logo file row missing'],
      });
      continue;
    }

    let streamResult;
    try {
      streamResult = await storage!.getObjectStream({ key: logo.path, bucket: logo.bucket });
    } catch (error: any) {
      report.push({
        orgId: org.id,
        orgName: org.name,
        logoId: org.logoId,
        sourceFile: '',
        candidateFile: '',
        candidateBackground: null,
        sourceWidth: null,
        sourceHeight: null,
        sourceAspectRatio: null,
        hasAlpha: false,
        warnings: [`logo object missing: ${logo.path}`],
      });
      continue;
    }
    const sourceBuffer = await streamToBuffer(streamResult.stream);
    const basename = `${slugify(org.name)}-${org.logoId}`;
    const sourceFile = `${basename}-source.png`;
    const candidateFile = `${basename}-opaque-candidate.png`;
    const sourcePath = path.join(assetsDir, sourceFile);
    const candidatePath = path.join(assetsDir, candidateFile);
    const { metadata, background } = await writeOpaqueCandidate(sourceBuffer, candidatePath);
    await sharp(sourceBuffer, { animated: false })
      .rotate()
      .png()
      .toFile(sourcePath);

    const width = metadata.width ?? null;
    const height = metadata.height ?? null;
    report.push({
      orgId: org.id,
      orgName: org.name,
      logoId: org.logoId,
      sourceFile,
      candidateFile,
      candidateBackground: background,
      sourceWidth: width,
      sourceHeight: height,
      sourceAspectRatio: width && height ? width / height : null,
      hasAlpha: Boolean(metadata.hasAlpha),
      warnings: buildWarnings(metadata),
    });
  }

  await fs.writeFile(path.join(outputRoot, 'index.html'), buildHtml(report));
  await fs.writeFile(path.join(outputRoot, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);

  const warningCount = report.filter((row) => row.warnings.length > 0).length;
  console.log(`Prepared ${report.length} affiliate logo previews.`);
  console.log(`Warnings: ${warningCount}`);
  console.log(`HTML: ${path.join(outputRoot, 'index.html')}`);
  console.log(`Report: ${path.join(outputRoot, 'report.json')}`);
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma?.$disconnect();
  });
