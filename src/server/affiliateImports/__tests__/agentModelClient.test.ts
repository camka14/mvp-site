/** @jest-environment node */

import {
  OpenAICompatibleAffiliateMappingModelClient,
} from '../agentModelClient';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);

const draft = {
  schemaVersion: 1,
  intakeId: 'intake_1',
  sourceKey: 'river-city',
  runId: 'run_1',
  policyDisposition: 'BLOCKED',
  implementationMode: 'BLOCKED',
  listingKind: null,
  evidence: [{
    artifactKind: 'ROBOTS',
    artifactSha256: HASH_A,
    pageUrl: 'https://rivercity.example/robots.txt',
    supports: ['policyDisposition'],
  }],
  organization: {
    name: null,
    website: null,
    description: null,
    city: null,
    address: null,
  },
  mapping: null,
  expectedCandidates: [],
  logo: {
    disposition: 'MISSING',
    artifactSha256: null,
    sourceUrl: null,
  },
  warnings: [],
  unresolvedQuestions: [],
};

describe('OpenAI-compatible open-weight mapping client', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('sends a deterministic schema-constrained request and parses the draft', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    global.fetch = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), init });
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify(draft) } }],
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;
    const client = new OpenAICompatibleAffiliateMappingModelClient({
      endpoint: 'http://127.0.0.1:8080',
      bearerToken: 'private-token',
      model: 'gpt-oss-20b',
      revision: {
        family: 'gpt-oss',
        upstreamRepository: 'openai/gpt-oss-20b',
        upstreamRevision: 'revision-1',
        artifactSha256: HASH_B,
        adapterRevision: null,
        promptTemplateRevision: 'prompt-v1',
      },
    });
    expect(await client.createDraft({
      jobId: 'job_1',
      intakeId: 'intake_1',
      sourceKey: 'river-city',
      runId: 'run_1',
      policyDisposition: 'BLOCKED',
      targetKindHints: [],
      artifacts: [{
        kind: 'ROBOTS',
        sha256: HASH_A,
        pageUrl: 'https://rivercity.example/robots.txt',
      }],
      evidenceExcerpts: [{
        kind: 'ROBOTS',
        sha256: HASH_A,
        pageUrl: 'https://rivercity.example/robots.txt',
        content: 'Disallow: /',
        truncated: false,
      }],
      instructionsRevision: 'v1',
    })).toEqual(draft);
    expect(requests[0].url).toBe('http://127.0.0.1:8080/v1/chat/completions');
    const body = JSON.parse(String(requests[0].init?.body));
    expect(body).toEqual(expect.objectContaining({
      model: 'gpt-oss-20b',
      temperature: 0,
      response_format: expect.objectContaining({ type: 'json_schema' }),
    }));
    expect((requests[0].init?.headers as Record<string, string>).authorization).toBe(
      'Bearer private-token',
    );
  });

  it('requires operator-supplied authentication and rejects non-JSON output', async () => {
    expect(() => new OpenAICompatibleAffiliateMappingModelClient({
      endpoint: 'http://127.0.0.1:8080',
      bearerToken: '',
      model: 'model',
      revision: {
        family: 'fixture',
        upstreamRepository: 'fixture/model',
        upstreamRevision: 'v1',
        artifactSha256: HASH_C,
        adapterRevision: null,
        promptTemplateRevision: 'v1',
      },
    })).toThrow('bearer token is required');

    global.fetch = jest.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: '```json\\n{}\\n```' } }],
    }), { status: 200 })) as typeof fetch;
    const client = new OpenAICompatibleAffiliateMappingModelClient({
      endpoint: 'http://127.0.0.1:8080',
      bearerToken: 'token',
      model: 'model',
      revision: {
        family: 'fixture',
        upstreamRepository: 'fixture/model',
        upstreamRevision: 'v1',
        artifactSha256: HASH_C,
        adapterRevision: null,
        promptTemplateRevision: 'v1',
      },
    });
    await expect(client.createDraft({
      jobId: 'job',
      intakeId: 'intake',
      sourceKey: 'source',
      runId: 'run',
      policyDisposition: 'BLOCKED',
      targetKindHints: [],
      artifacts: [],
      instructionsRevision: 'v1',
    })).rejects.toThrow('non-JSON draft content');
  });
});
