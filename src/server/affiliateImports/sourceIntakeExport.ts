type IntakeRunLike = {
  id: string;
  status: string;
  provider?: string | null;
  createdAt?: Date | string | null;
  startedAt?: Date | string | null;
  finishedAt?: Date | string | null;
};

type IntakePageLike = {
  id: string;
  url: string;
  canonicalUrl?: string | null;
  role?: string | null;
  robotsStatus?: string | null;
};

type IntakeArtifactLike = {
  id: string;
  kind: string;
  sourceUrl?: string | null;
  finalUrl?: string | null;
  contentHash: string;
  localPath?: string | null;
};

const EXPORTABLE_RUN_STATUSES = new Set(['SUCCEEDED', 'PARTIAL', 'BLOCKED']);

export const affiliateSiteIntakeKeyForUrl = (value: string): string => {
  const host = new URL(value).hostname.toLowerCase().replace(/^www\./, '');
  return `site-${host}`
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
};

export const selectAffiliateSourceIntakeExportRun = <T extends IntakeRunLike>(
  runs: T[],
  requestedRunId?: string,
): T | undefined => {
  if (requestedRunId) return runs.find((run) => run.id === requestedRunId);
  return runs.find((run) => EXPORTABLE_RUN_STATUSES.has(run.status));
};

const isoString = (value?: Date | string | null): string | null => {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

export const buildAffiliateSourceEvidence = (input: {
  environment: 'live' | 'local';
  intake: {
    id: string;
    sourceKey: string;
    name: string;
    baseUrl?: string | null;
    complianceStatus?: string | null;
  };
  run: IntakeRunLike;
  pages: IntakePageLike[];
  artifacts: IntakeArtifactLike[];
}) => {
  const artifactCounts = new Map<string, number>();
  input.artifacts.forEach((artifact) => {
    artifactCounts.set(artifact.kind, (artifactCounts.get(artifact.kind) ?? 0) + 1);
  });

  return {
    schemaVersion: 1,
    evidenceSystem: 'AffiliateSourceIntakes',
    environment: input.environment,
    intakeId: input.intake.id,
    intakeSourceKey: input.intake.sourceKey,
    intakeName: input.intake.name,
    baseUrl: input.intake.baseUrl ?? null,
    complianceStatus: input.intake.complianceStatus ?? null,
    runId: input.run.id,
    runStatus: input.run.status,
    provider: input.run.provider ?? null,
    capturedAt: isoString(input.run.finishedAt ?? input.run.startedAt ?? input.run.createdAt),
    pages: input.pages.map((page) => ({
      url: page.url,
      role: page.role ?? null,
      robotsStatus: page.robotsStatus ?? null,
    })),
    artifactKinds: Array.from(artifactCounts.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([kind, count]) => ({ kind, count })),
  };
};

export const renderAffiliateSourceEvidenceMarkdown = (
  evidence: ReturnType<typeof buildAffiliateSourceEvidence>,
): string => {
  const pageLines = evidence.pages.map((page) => (
    `- \`${page.role ?? 'PAGE'}\`: ${page.url} (robots: ${page.robotsStatus ?? 'unknown'})`
  ));
  const artifactLines = evidence.artifactKinds
    .map(({ kind, count }) => `- \`${kind}\`: ${count}`);

  return [
    '# Affiliate Source Evidence',
    '',
    'This export is a read-only snapshot from the database-backed affiliate source intake pipeline.',
    '',
    `- Environment: \`${evidence.environment}\``,
    `- Intake: \`${evidence.intakeSourceKey}\` (\`${evidence.intakeId}\`)`,
    `- Run: \`${evidence.runId}\` (\`${evidence.runStatus}\`)`,
    `- Provider: \`${evidence.provider ?? 'unknown'}\``,
    `- Captured at: \`${evidence.capturedAt ?? 'unknown'}\``,
    `- Compliance: \`${evidence.complianceStatus ?? 'unknown'}\``,
    '',
    '## Source Pages',
    '',
    ...(pageLines.length ? pageLines : ['- None recorded.']),
    '',
    '## Stored Artifacts',
    '',
    ...(artifactLines.length ? artifactLines : ['- None recorded.']),
    '',
    'Use `source-evidence.json` for setup-script `metadata.sourceEvidence` provenance.',
    '',
  ].join('\n');
};
