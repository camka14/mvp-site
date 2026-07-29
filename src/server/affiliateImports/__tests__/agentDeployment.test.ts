/** @jest-environment node */

import fs from 'node:fs';
import path from 'node:path';

const repositoryRoot = process.cwd();
const read = (relativePath: string) => fs.readFileSync(
  path.join(repositoryRoot, relativePath),
  'utf8',
);

describe('affiliate mapping VM deployment boundary', () => {
  it('keeps operational credentials out of the offline model service', () => {
    const compose = read('deploy/ai/compose.yml');
    const modelService = compose.split('\n  controller:\n')[0];

    expect(modelService).toContain('- model_private');
    expect(compose).toContain('model_private:\n    internal: true');
    expect(modelService).toContain('--offline');
    expect(modelService).toContain('--api-key-file');
    expect(modelService).toContain('127.0.0.1:${MODEL_HOST_PORT:-8080}:8080');
    expect(modelService).not.toContain('env_file:');
    expect(modelService).not.toMatch(
      /DATABASE_URL|DO_SPACES|GITHUB|CODEX|SMTP|SCRAPINGDOG|FIRECRAWL/,
    );
  });

  it('defaults the queue controller to disabled and prevents live review scraping', () => {
    const compose = read('deploy/ai/compose.yml');
    const runner = read('deploy/ai/bin/run-controller-once.sh');

    expect(compose).toContain('AFFILIATE_MAPPING_MODE: ${CONTROLLER_MODE:-disabled}');
    expect(runner).toContain('if [[ "$mode" != "dry-run" ]]');
    expect(runner).toContain('arguments+=("--live")');
    expect(runner).toContain('exit 64');
  });

  it('runs the held-out evaluator without the trusted controller environment', () => {
    const compose = read('deploy/ai/compose.yml');
    const evaluator = compose
      .split('\n  evaluator:\n')[1]
      .split('\nnetworks:\n')[0];

    expect(evaluator).not.toContain('env_file:');
    expect(evaluator).not.toMatch(/DATABASE_URL|DO_SPACES|SCRAPINGDOG|FIRECRAWL/);
    expect(evaluator).toContain('- model_private');
    expect(evaluator).not.toContain('- controller_egress');
  });

  it('requires digest-pinned runtime images during host verification', () => {
    const verification = read('deploy/ai/bin/verify-host.sh');

    expect(verification).toContain('@sha256:[a-f0-9]{64}$');
    expect(verification).toContain('LLAMA_CPP_IMAGE');
    expect(verification).toContain('CONTROLLER_IMAGE');
    expect(verification).toContain('commercialUseApproved');
    expect(verification).toContain('offlineColdStartVerifiedAt');
    expect(verification).toContain('quantization hash does not match');
  });
});
