import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  assertAffiliateGoldCohortProposalIntegrity,
  reviseAffiliateGoldCohortRequiredPage,
} from '../src/server/affiliateImports/agentGoldCohort';

const shouldWrite = process.argv.includes('--write');

const readOption = (name: string): string | undefined => {
  const equals = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1).trim() || undefined;
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() || undefined : undefined;
};

const writeImmutableJson = async (filePath: string, value: unknown) => {
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  try {
    const existing = await fs.readFile(filePath, 'utf8');
    if (existing !== serialized) {
      throw new Error(`Cohort proposal already exists with different content: ${filePath}`);
    }
    return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  await fs.writeFile(filePath, serialized, { encoding: 'utf8', flag: 'wx' });
};

const requiredOption = (name: string): string => {
  const value = readOption(name);
  if (!value) throw new Error(`${name} is required.`);
  return value;
};

const main = async () => {
  const proposalPath = path.resolve(requiredOption('--proposal'));
  const originalProposal = JSON.parse(await fs.readFile(proposalPath, 'utf8'));
  assertAffiliateGoldCohortProposalIntegrity(originalProposal);
  const repositoryCommit = readOption('--repository-commit')
    ?? execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    }).trim();
  const revisedProposal = reviseAffiliateGoldCohortRequiredPage({
    proposal: originalProposal,
    sourceKey: requiredOption('--source-key'),
    fromUrl: requiredOption('--from-url'),
    toUrl: requiredOption('--to-url'),
    reason: requiredOption('--reason'),
    repositoryCommit,
  });
  const outputRoot = path.resolve(
    readOption('--output-dir')
      ?? path.join('output', 'affiliate-mapping-agent', 'gold-cohorts'),
  );
  const outputDirectory = path.join(outputRoot, revisedProposal.cohortId);
  const revisedProposalPath = path.join(outputDirectory, 'proposal.json');
  if (shouldWrite) {
    await fs.mkdir(outputDirectory, { recursive: true });
    await writeImmutableJson(revisedProposalPath, revisedProposal);
  }
  console.log(JSON.stringify({
    previousCohortId: originalProposal.cohortId,
    cohortId: revisedProposal.cohortId,
    proposalSha256: revisedProposal.proposalSha256,
    repositoryCommit: revisedProposal.repositoryCommit,
    sourceKey: requiredOption('--source-key'),
    fromUrl: requiredOption('--from-url'),
    toUrl: requiredOption('--to-url'),
    reason: requiredOption('--reason'),
    dryRun: !shouldWrite,
    proposalPath: shouldWrite ? revisedProposalPath : null,
    databaseWrites: 0,
    publicRequests: 0,
  }, null, 2));
};

main().catch((error) => {
  console.error('[affiliate:mapping:gold-revise] failed', error);
  process.exitCode = 1;
});
