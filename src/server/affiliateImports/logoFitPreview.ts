import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const AFFILIATE_LOGO_FIT_MARKER = '.affiliate-logo-fit-preview.json';

export type AffiliateLogoFitScope =
  | { mode: 'ORGANIZATION'; organizationId: string }
  | { mode: 'ALL' };

export type AffiliateLogoFitOptions = {
  useLive: boolean;
  outputRoot: string;
  scope: AffiliateLogoFitScope;
};

export type AffiliateLogoFitMarker = {
  schemaVersion: 1;
  artifactType: 'AFFILIATE_LOGO_FIT_PREVIEW';
  generatedCopiesOnly: true;
  completedAt: string;
  previewCount: number;
  scope: AffiliateLogoFitScope;
};

const readOption = (arguments_: string[], name: string): string | undefined => {
  const matches = arguments_.flatMap((argument, index) => {
    if (argument.startsWith(`${name}=`)) return [argument.slice(name.length + 1).trim()];
    if (argument === name) return [arguments_[index + 1]?.trim() ?? ''];
    return [];
  }).filter(Boolean);
  if (matches.length > 1) throw new Error(`${name} may be supplied only once.`);
  return matches[0];
};

export const parseAffiliateLogoFitOptions = (
  arguments_: string[],
  workingDirectory = process.cwd(),
): AffiliateLogoFitOptions => {
  const organizationId = readOption(arguments_, '--organization-id');
  const allOrganizations = arguments_.includes('--all');
  if (organizationId && allOrganizations) {
    throw new Error('--organization-id and --all cannot be used together.');
  }
  if (!organizationId && !allOrganizations) {
    throw new Error(
      'Supply --organization-id=<exact-organization-id>. Use --all only for an intentional full-catalog audit.',
    );
  }
  if (organizationId && !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,199}$/.test(organizationId)) {
    throw new Error('--organization-id contains unsupported characters.');
  }
  const output = readOption(arguments_, '--output');
  const outputRoot = path.resolve(
    workingDirectory,
    output ?? path.join('output', 'affiliate-logo-fit'),
  );
  const prohibitedOutputs = new Set([
    path.parse(outputRoot).root,
    path.resolve(workingDirectory),
    path.resolve(os.homedir()),
    path.resolve(os.tmpdir()),
  ]);
  if (
    prohibitedOutputs.has(outputRoot)
    || !path.basename(outputRoot).toLowerCase().includes('logo-fit')
  ) {
    throw new Error(
      '--output must name a specific logo-fit directory. Broad output paths are refused.',
    );
  }
  return {
    useLive: arguments_.includes('--live'),
    outputRoot,
    scope: organizationId
      ? { mode: 'ORGANIZATION', organizationId }
      : { mode: 'ALL' },
  };
};

export const buildAffiliateLogoFitOrganizationWhere = (
  scope: AffiliateLogoFitScope,
): Record<string, unknown> => scope.mode === 'ORGANIZATION'
  ? { id: scope.organizationId, logoId: { not: null } }
  : { id: { startsWith: 'affiliate_org_' }, logoId: { not: null } };

export const assertAffiliateLogoFitSelection = (
  scope: AffiliateLogoFitScope,
  organizations: Array<{ id: string }>,
): void => {
  if (scope.mode !== 'ORGANIZATION') return;
  if (organizations.length !== 1 || organizations[0]?.id !== scope.organizationId) {
    throw new Error(
      `Organization ${scope.organizationId} was not found or does not have an assigned logo.`,
    );
  }
};

export const writeAffiliateLogoFitMarker = async (
  outputRoot: string,
  marker: Omit<AffiliateLogoFitMarker, 'schemaVersion' | 'artifactType' | 'generatedCopiesOnly'>,
): Promise<void> => {
  const value: AffiliateLogoFitMarker = {
    schemaVersion: 1,
    artifactType: 'AFFILIATE_LOGO_FIT_PREVIEW',
    generatedCopiesOnly: true,
    ...marker,
  };
  await fs.writeFile(
    path.join(outputRoot, AFFILIATE_LOGO_FIT_MARKER),
    `${JSON.stringify(value, null, 2)}\n`,
  );
};

const getDirectorySize = async (root: string): Promise<number> => {
  let total = 0;
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) total += await getDirectorySize(entryPath);
    else if (entry.isFile()) total += (await fs.stat(entryPath)).size;
  }
  return total;
};

export type AffiliateLogoFitPreviewInspection = {
  path: string;
  bytes: number;
  marker: AffiliateLogoFitMarker;
};

export const inspectAffiliateLogoFitPreview = async (
  requestedPath: string,
  workingDirectory = process.cwd(),
): Promise<AffiliateLogoFitPreviewInspection> => {
  const target = path.resolve(workingDirectory, requestedPath);
  const prohibitedTargets = new Set([
    path.parse(target).root,
    path.resolve(workingDirectory),
    path.resolve(os.homedir()),
    path.resolve(os.tmpdir()),
  ]);
  if (prohibitedTargets.has(target)) {
    throw new Error(`Refusing broad logo preview cleanup target: ${target}`);
  }
  const targetStat = await fs.lstat(target);
  if (!targetStat.isDirectory() || targetStat.isSymbolicLink()) {
    throw new Error(`Logo preview cleanup target must be a real directory: ${target}`);
  }
  const markerPath = path.join(target, AFFILIATE_LOGO_FIT_MARKER);
  const marker = JSON.parse(await fs.readFile(markerPath, 'utf8')) as AffiliateLogoFitMarker;
  if (
    marker.schemaVersion !== 1
    || marker.artifactType !== 'AFFILIATE_LOGO_FIT_PREVIEW'
    || marker.generatedCopiesOnly !== true
    || !Number.isInteger(marker.previewCount)
    || marker.previewCount < 0
  ) {
    throw new Error(`Invalid affiliate logo preview marker: ${markerPath}`);
  }
  const indexStat = await fs.stat(path.join(target, 'index.html'));
  const reportPath = path.join(target, 'report.json');
  const reportStat = await fs.stat(reportPath);
  const assetsStat = await fs.stat(path.join(target, 'assets'));
  if (!indexStat.isFile() || !reportStat.isFile() || !assetsStat.isDirectory()) {
    throw new Error(`Incomplete affiliate logo preview directory: ${target}`);
  }
  const report = JSON.parse(await fs.readFile(reportPath, 'utf8')) as unknown;
  if (!Array.isArray(report) || report.length !== marker.previewCount) {
    throw new Error(`Affiliate logo preview report does not match its marker: ${target}`);
  }
  return { path: target, bytes: await getDirectorySize(target), marker };
};

export const removeAffiliateLogoFitPreview = async (
  requestedPath: string,
  options: { apply: boolean; workingDirectory?: string },
): Promise<AffiliateLogoFitPreviewInspection & { removed: boolean }> => {
  const inspection = await inspectAffiliateLogoFitPreview(
    requestedPath,
    options.workingDirectory,
  );
  if (options.apply) await fs.rm(inspection.path, { recursive: true, force: false });
  return { ...inspection, removed: options.apply };
};
