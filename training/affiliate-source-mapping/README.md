# Affiliate source mapping adapter training

This directory is the short-lived GPU half of the affiliate mapping plan. It is
not installed on the persistent VPS. It trains LoRA adapter weights from an
immutable, human-approved SFT release, records the changed adapter tensors, and
can merge an accepted adapter into a clean copy of the exact open-weight base.

No current historical mapping is automatically eligible for training. Build a
release only after evidence reconstruction and human approval:

    npm run affiliate:mapping:sft-release -- \
      --input=/secure/reviewed-teaching-envelopes.jsonl \
      --release=affiliate-mapping-sft-v1

The command writes `manifest.json` and train/validation/test JSONL files under
the ignored `output/affiliate-mapping-agent/training-releases` directory. It
rejects partial or stale evidence, unapproved Sol output, secrets, signed URLs,
direct email addresses, draft/hash mismatches, and domain leakage across
splits.

## Reproducible training image

Build with a digest-pinned NVIDIA CUDA 12.8 development image:

    docker build -f training/affiliate-source-mapping/Dockerfile \
      --build-arg TRAINING_BASE_IMAGE=nvidia/cuda:<reviewed-tag>@sha256:<digest> \
      -t <registry>/affiliate-mapping-training:<training-stack-commit> .

Resolve and record the resulting image digest before launching a paid job.
`requirements.lock` pins the first supported stack to PyTorch 2.8,
Transformers 4.55, TRL 0.20, and PEFT 0.17. Those are the versions required by
the first official gpt-oss LoRA recipe; future upgrades require a new
experiment rather than changing a completed manifest.

Mount the complete base checkpoint at `/workspace/base-model`, an immutable SFT
release at `/workspace/dataset`, and a durable output volume at
`/workspace/output`. The runtime sets Hugging Face, Transformers, and Datasets
offline flags. Download base weights and build the image before starting the
metered training clock; do not put a Hub token in the training container.

Copy a tracked config to the durable output volume and replace every
`REPLACE_...` field. Hash the exact dataset `manifest.json` file for
`datasetManifestSha256`. Hash and reference the exact reviewed
`OpenWeightModelManifest` for `baseModelManifestSha256`; the trainer verifies
that file, its immutable upstream revision, the three license approvals, and
the no-vendor-API condition before loading weights.

## Required sequence

First inspect the pinned checkpoint:

    ./bin/run-training-stage.sh inspect /workspace/output/experiment-config.json \
      /workspace/output/model-inspection.json

Review the actual attention and expert parameter names. Qwen training remains
blocked while `requiresReviewedTargetParameters` is true and its target list
contains a placeholder. The gpt-oss smoke config starts from the expert
projection subset in OpenAI's published recipe, but its inspection report must
still show real matches before paid training.

Then prove that weights can change on one approved example:

    OVH_TRAINING_HOURLY_PRICE_USD=<checkout-price> \
    TRAINING_MAX_COMPUTE_COST_USD=<two-hour-cap> \
    TRAINING_STACK_REVISION=<commit> \
    TRAINING_IMAGE=<image@sha256> \
    OVH_AI_JOB_ID=<provider-job-id> \
      ./bin/run-training-stage.sh overfit /workspace/output/experiment-config.json

The run fails if no LoRA tensor exists or if the final adapter hash equals its
initial hash. Inspect the held-in output separately; a changed hash alone does
not prove useful learning.

Run the bounded smoke configuration next. A smoke config cannot exceed 7,200
seconds. The trainer also computes a stricter runtime from the operator-entered
hourly price and cost cap and stops at that boundary. The experiment manifest
records provider job id, image and stack revision, base/dataset hashes, target
matches, trainable parameter names, adapter hashes, trainer throughput, peak
allocated GPU memory, runtime, and observed compute cost.

Do not start a full run until the smoke projection is accepted. Full mode
requires `TRAINING_APPROVAL_ID` and the normal compute cap remains $20 unless
the user approves a different cap.

## Model-specific loading

`gpt-oss-20b` uses `Mxfp4Config(dequantize=True)`, bfloat16 computation, eager
attention, gradient checkpointing, all linear modules, and explicitly reviewed
expert projection parameters. This follows the published gpt-oss training
path; it does not force bitsandbytes NF4 onto the MXFP4 architecture.

Qwen3-Coder uses bitsandbytes NF4 QLoRA with bfloat16 computation. Its expert
parameter names are checkpoint-specific, so the tracked example intentionally
cannot run until inspection replaces the placeholder and a reviewer clears the
target list.

Both paths use a maximum sequence length of 2,048 for the first smoke. The
8,192-token full example is an upper target, not permission to skip the memory
projection.

## Merge, evaluate, and retain

After an adapter beats the frozen base evaluation and is approved, merge it on
the temporary GPU host:

    ./bin/run-training-stage.sh merge /workspace/output/experiment-config.json \
      /workspace/output/<experiment>/adapter \
      /workspace/output/<experiment>/merged

`merge_adapter.py` loads a clean local base, applies only the selected adapter,
uses PEFT safe merge, writes a safetensors derivative, and records every output
hash. Quantization/conversion remains a separate pinned llama.cpp step because
gpt-oss native MXFP4 and Qwen GGUF require different verified paths.

Before terminating the paid job, copy and verify the config, inspection report,
dataset manifest, experiment manifest, adapter, merged derivative, tokenizer
and template, license/notices, evaluation report, and hashes in durable
BracketIQ-controlled storage. Terminate the OVH job immediately afterward.
