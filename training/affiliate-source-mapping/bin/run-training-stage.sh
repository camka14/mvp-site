#!/usr/bin/env bash
set -Eeuo pipefail

stage="${1:-}"
config="${2:-}"
if [[ -z "$stage" || -z "$config" || ! -r "$config" ]]; then
  echo "Usage: $0 inspect|overfit|smoke|full|merge <config> [adapter] [output]" >&2
  exit 64
fi

export HF_HUB_OFFLINE=1
export TRANSFORMERS_OFFLINE=1
export HF_DATASETS_OFFLINE=1
export WANDB_DISABLED=true

case "$stage" in
  inspect)
    output="${3:-/workspace/output/model-inspection.json}"
    exec python3 inspect_model.py --config "$config" --output "$output"
    ;;
  overfit)
    exec python3 train_lora.py --config "$config" --overfit-one
    ;;
  smoke)
    exec python3 train_lora.py --config "$config"
    ;;
  full)
    if [[ -z "${TRAINING_APPROVAL_ID:-}" ]]; then
      echo "Full training requires TRAINING_APPROVAL_ID." >&2
      exit 64
    fi
    exec python3 train_lora.py --config "$config"
    ;;
  merge)
    adapter="${3:-}"
    output="${4:-}"
    if [[ -z "$adapter" || -z "$output" ]]; then
      echo "Merge requires adapter and output directories." >&2
      exit 64
    fi
    exec python3 merge_adapter.py --config "$config" --adapter "$adapter" --output "$output"
    ;;
  *)
    echo "Unknown training stage: $stage" >&2
    exit 64
    ;;
esac
