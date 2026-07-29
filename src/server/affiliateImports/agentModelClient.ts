import type {
  AffiliateSourceDraft,
  ModelRevision,
} from './agentContracts';

export type AffiliateMappingJobArtifact = {
  kind: string;
  sha256: string;
  pageUrl: string;
  byteLength?: number;
};

export type AffiliateMappingJobContext = {
  jobId: string;
  intakeId: string;
  sourceKey: string;
  runId: string;
  policyDisposition: 'ALLOWED' | 'BLOCKED' | 'NEEDS_REVIEW';
  targetKindHints: Array<'EVENT' | 'RENTAL' | 'TEAM' | 'CLUB'>;
  artifacts: AffiliateMappingJobArtifact[];
  instructionsRevision: string;
};

export interface AffiliateMappingModelClient {
  modelRevision(): Promise<ModelRevision>;
  createDraft(input: AffiliateMappingJobContext): Promise<AffiliateSourceDraft | unknown>;
}

export class FixtureAffiliateMappingModelClient implements AffiliateMappingModelClient {
  constructor(
    private readonly revision: ModelRevision,
    private readonly draftsByJobId: ReadonlyMap<string, unknown>,
  ) {}

  async modelRevision(): Promise<ModelRevision> {
    return this.revision;
  }

  async createDraft(input: AffiliateMappingJobContext): Promise<unknown> {
    if (!this.draftsByJobId.has(input.jobId)) {
      throw new Error(`Fixture draft not found for job ${input.jobId}.`);
    }
    return this.draftsByJobId.get(input.jobId);
  }
}
