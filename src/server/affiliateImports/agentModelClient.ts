import type {
  AffiliateSourceDraft,
  ModelRevision,
} from './agentContracts';
import { affiliateSourceDraftSchema } from './agentContracts';
import { z } from 'zod';

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
  evidenceExcerpts?: Array<{
    kind: string;
    sha256: string;
    pageUrl: string;
    content: string;
    truncated: boolean;
  }>;
  repositoryExcerpts?: Array<{
    path: string;
    content: string;
    truncated: boolean;
  }>;
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

type OpenAICompatibleChatResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
};

export class OpenAICompatibleAffiliateMappingModelClient implements AffiliateMappingModelClient {
  private readonly endpoint: string;
  private readonly bearerToken: string;
  private readonly model: string;
  private readonly revision: ModelRevision;
  private readonly timeoutMs: number;

  constructor(input: {
    endpoint: string;
    bearerToken: string;
    model: string;
    revision: ModelRevision;
    timeoutMs?: number;
  }) {
    const endpoint = new URL(input.endpoint);
    if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password) {
      throw new Error('Model endpoint must be an HTTP(S) URL without embedded credentials.');
    }
    if (!input.bearerToken.trim()) throw new Error('Model endpoint bearer token is required.');
    if (!input.model.trim()) throw new Error('Model endpoint model id is required.');
    this.endpoint = endpoint.toString().replace(/\/$/, '');
    this.bearerToken = input.bearerToken;
    this.model = input.model;
    this.revision = input.revision;
    this.timeoutMs = input.timeoutMs ?? 20 * 60 * 1000;
  }

  async modelRevision(): Promise<ModelRevision> {
    return this.revision;
  }

  async createDraft(input: AffiliateMappingJobContext): Promise<AffiliateSourceDraft> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.endpoint}/v1/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          authorization: `Bearer ${this.bearerToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          temperature: 0,
          max_tokens: 2048,
          messages: [
            {
              role: 'system',
              content: [
                'You are the BracketIQ affiliate source mapping worker.',
                'Return exactly one JSON AffiliateSourceDraft matching the supplied schema.',
                'Use only supplied artifact and repository excerpts.',
                'Cite exact artifact SHA-256 values for every supported claim.',
                'Never invent dates, action URLs, locations, prices, divisions, tags, or logos.',
                'For BLOCKED policy return BLOCKED with no mapping.',
                'For missing evidence return INSUFFICIENT_EVIDENCE with no mapping.',
                'Use official source action URLs, never BracketIQ URLs.',
                'A real organization logo must be an official stored asset, an official screenshot crop, missing, or manual review; never generate one.',
                'Prefer GENERIC_MAPPING or MANUAL_CANDIDATES. Request CUSTOM_EXTRACTOR_REQUIRED without code when the mapping contract is insufficient.',
              ].join('\n'),
            },
            {
              role: 'user',
              content: JSON.stringify(input),
            },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'affiliate_source_draft',
              strict: true,
              schema: z.toJSONSchema(affiliateSourceDraftSchema),
            },
          },
        }),
      });
      if (!response.ok) {
        throw new Error(`Model endpoint returned HTTP ${response.status}.`);
      }
      const body = await response.json() as OpenAICompatibleChatResponse;
      const content = body.choices?.[0]?.message?.content;
      if (!content) throw new Error('Model endpoint returned no draft content.');
      let value: unknown;
      try {
        value = JSON.parse(content);
      } catch {
        throw new Error('Model endpoint returned non-JSON draft content.');
      }
      return affiliateSourceDraftSchema.parse(value);
    } finally {
      clearTimeout(timeout);
    }
  }
}
