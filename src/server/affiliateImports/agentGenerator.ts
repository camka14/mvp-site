import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  affiliateSourceDraftSchema,
  type AffiliateSourceDraft,
} from './agentContracts';
import {
  renderAffiliateGeneratedConfig,
  renderAffiliateGeneratedSetup,
  renderAffiliateGeneratedTest,
  renderAffiliateRegistryNote,
  type AffiliateGeneratedSourceTemplateInput,
} from './agentTemplates/sourceFiles';

export type AffiliateGeneratedFile = {
  path: string;
  content: string;
  sha256: string;
};

const safeSourceSlug = (sourceKey: string): string => {
  const slug = sourceKey
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  if (!slug || slug !== sourceKey) {
    throw new Error('Draft sourceKey must already be a lowercase URL-safe slug.');
  }
  return slug;
};

const symbolNameFor = (slug: string): string => slug
  .split('-')
  .filter(Boolean)
  .map((part) => part.toUpperCase())
  .join('_');

const identifierSuffix = (draft: AffiliateSourceDraft): string => (
  createHash('sha256')
    .update(`${draft.intakeId}|${draft.sourceKey}`)
    .digest('hex')
    .slice(0, 12)
);

const generatedFile = (filePath: string, content: string): AffiliateGeneratedFile => ({
  path: filePath,
  content,
  sha256: createHash('sha256').update(content).digest('hex'),
});

export const renderAffiliateSourceDraft = (value: unknown): AffiliateGeneratedFile[] => {
  const draft = affiliateSourceDraftSchema.parse(value);
  if (
    draft.implementationMode !== 'GENERIC_MAPPING'
    && draft.implementationMode !== 'MANUAL_CANDIDATES'
  ) {
    throw new Error(`Draft mode ${draft.implementationMode} cannot generate executable files.`);
  }
  if (!draft.mapping || !draft.listingKind) {
    throw new Error('Executable source generation requires a mapping and listing kind.');
  }
  const slug = safeSourceSlug(draft.sourceKey);
  const symbolName = symbolNameFor(slug);
  const suffix = identifierSuffix(draft);
  const configName = `${slug}GeneratedSource`;
  const configPath = `src/server/affiliateImports/generatedSources/${configName}.ts`;
  const setupPath = `scripts/setup-${slug}-affiliate-source.ts`;
  const testPath = `src/server/affiliateImports/__tests__/${configName}.test.ts`;
  const registryPath = `docs/affiliate-source-registry-fragments/${slug}.md`;
  const templateInput: AffiliateGeneratedSourceTemplateInput = {
    draft,
    symbolName,
    sourceId: `affiliate_source_agent_${slug}_${suffix}`,
    organizationId: `affiliate_org_agent_${slug}_${suffix}`,
    mappingId: `affiliate_mapping_agent_${slug}_${suffix}_v1`,
    configImportPathFromSetup: `../src/server/affiliateImports/generatedSources/${configName}`,
    configImportPathFromTest: `../generatedSources/${configName}`,
  };
  return [
    generatedFile(configPath, renderAffiliateGeneratedConfig(templateInput)),
    generatedFile(setupPath, renderAffiliateGeneratedSetup(templateInput)),
    generatedFile(testPath, renderAffiliateGeneratedTest(templateInput)),
    generatedFile(registryPath, renderAffiliateRegistryNote(templateInput)),
  ].sort((left, right) => left.path.localeCompare(right.path));
};

const resolvedGeneratedPath = (rootDirectory: string, relativePath: string): string => {
  const root = path.resolve(rootDirectory);
  const target = path.resolve(root, relativePath);
  if (!target.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Generated path escapes the worktree: ${relativePath}`);
  }
  return target;
};

export const writeAffiliateGeneratedFiles = async (input: {
  rootDirectory: string;
  files: AffiliateGeneratedFile[];
  overwrite?: boolean;
}): Promise<{ written: string[]; unchanged: string[] }> => {
  const written: string[] = [];
  const unchanged: string[] = [];
  for (const file of [...input.files].sort((left, right) => left.path.localeCompare(right.path))) {
    const target = resolvedGeneratedPath(input.rootDirectory, file.path);
    let existing: string | null = null;
    try {
      existing = await fs.readFile(target, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (existing === file.content) {
      unchanged.push(file.path);
      continue;
    }
    if (existing !== null && !input.overwrite) {
      throw new Error(`Refusing to overwrite changed generated file: ${file.path}`);
    }
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, file.content, 'utf8');
    written.push(file.path);
  }
  return { written, unchanged };
};
