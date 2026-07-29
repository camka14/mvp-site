/** @jest-environment node */

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const readJson = (relativePath: string) => JSON.parse(read(relativePath));

describe('affiliate mapping GPU training scaffold', () => {
  it('pins every Python dependency and requires a digest-pinned base image argument', () => {
    const requirements = read('training/affiliate-source-mapping/requirements.lock')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && !line.startsWith('--'));
    expect(requirements.length).toBeGreaterThan(5);
    expect(requirements.every((line) => /^[a-z0-9-]+==[^=]+$/i.test(line))).toBe(true);

    const dockerfile = read('training/affiliate-source-mapping/Dockerfile');
    expect(dockerfile).toContain('ARG TRAINING_BASE_IMAGE');
    expect(dockerfile).toContain('FROM ${TRAINING_BASE_IMAGE}');
    expect(dockerfile).toContain('HF_HUB_OFFLINE=1');
  });

  it('keeps smoke runs below two hours and sequence length at or below 8192', () => {
    const configs = [
      readJson('training/affiliate-source-mapping/configs/gpt-oss-20b-smoke.json'),
      readJson('training/affiliate-source-mapping/configs/gpt-oss-20b-full.example.json'),
      readJson('training/affiliate-source-mapping/configs/qwen3-coder-30b-a3b-smoke.example.json'),
    ];
    for (const config of configs) {
      expect(config.training.maxSequenceLength).toBeLessThanOrEqual(8192);
      if (config.experimentKind === 'smoke') {
        expect(config.training.maxRuntimeSeconds).toBeLessThanOrEqual(7200);
      }
    }
  });

  it('uses the architecture-specific adapter loading paths and no hosted publishing', () => {
    const common = read('training/affiliate-source-mapping/training_common.py');
    const trainer = read('training/affiliate-source-mapping/train_lora.py');
    const qwen = readJson(
      'training/affiliate-source-mapping/configs/qwen3-coder-30b-a3b-smoke.example.json',
    );
    const gptOss = readJson(
      'training/affiliate-source-mapping/configs/gpt-oss-20b-smoke.json',
    );

    expect(common).toContain('Mxfp4Config(dequantize=True)');
    expect(common).toContain('bnb_4bit_quant_type="nf4"');
    expect(gptOss.loader.mode).toBe('mxfp4_dequantize');
    expect(gptOss.lora.targetParameters).toContain('7.mlp.experts.gate_up_proj');
    expect(qwen.loader.mode).toBe('bnb_nf4');
    expect(qwen.lora.requiresReviewedTargetParameters).toBe(true);
    expect(trainer).toContain('push_to_hub=False');
    expect(trainer).not.toContain('.push_to_hub(');
  });
});
