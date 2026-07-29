# Affiliate source mapping model bakeoff

Status: not run. This file is the durable result surface for the model bakeoff;
it does not claim that an OVH VM, model download, or benchmark already exists.

The frozen candidates are:

| Candidate | Exact revision | Serving artifact | Open-weight manifest | OVH result | Decision |
| --- | --- | --- | --- | --- | --- |
| gpt-oss-20b | Pending | Native MXFP4-compatible llama.cpp artifact | Pending license/hash review | Not run | Pending |
| Qwen3-Coder-30B-A3B-Instruct | Pending | Reviewed four-bit GGUF | Pending license/hash review | Not run | Pending |
| Sub-10B fallback | Pending selection | Pending | Pending license/hash review | Not run | Pending |

Do not fill a result from model-card estimates or another host. Every candidate
must run on the same ordered OVH CPU host, with the same held-out suite, local
weights, llama.cpp revision, 8,192-token context, 2,048-token output limit, one
slot, q8 KV cache unless a recorded revision changes it, and temperature zero.

For each candidate:

1. Complete `OpenWeightModelManifest` with exact repository revision, weight and
   license hashes, notices, commercial/modification/derivative review, runtime
   revision, quantization provenance, and verified offline cold start.
2. Run `affiliate:mapping:evaluate` with `--worker=llama`. The private suite
   contains expected drafts, but only each example's context is sent to the
   model endpoint.
3. Record the exact OVH order/region/image/price, CPU flags, RAM/disk, pinned
   runtime image, cold-start time, peak resident memory, peak swap, minimum
   available memory, representative job wall time, and llama.cpp throughput in
   an `AffiliateModelRuntimeObservation`.
4. Build the immutable report with `affiliate:mapping:bakeoff:record`. A failed
   gate intentionally returns exit code 2 while preserving the report.
5. Run `affiliate:mapping:bakeoff:select` with every candidate report. Do not
   hand-select a model that the command marks ineligible.

The hard rejections are any failed open-weight permission, vendor API
dependency, offline-start failure, evaluation-gate failure, more than 22 GiB
resident memory, more than 512 MiB swap, less than 1 GiB available memory, more
than 90 minutes for a representative job, or a changed context/output limit.

Among eligible models, selection uses the frozen composite mapping score. When
scores are within two percentage points, lower material Sol correction rate
wins; if still tied, lower peak resident memory and then lower wall time win.

When the real bakeoff is complete, replace `Status: not run` with the date,
host, selected report id, selected model revision/artifact hash, measured
table, per-source failures, rejection reasons, and rollback model. Link the
ignored/private JSON reports by durable object-storage path and hash without
putting held-out source evidence in Git.
