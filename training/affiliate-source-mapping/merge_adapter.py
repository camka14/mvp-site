from __future__ import annotations

import argparse
import json
from pathlib import Path

from training_common import (
    read_json,
    require_resolved_config,
    sha256_file,
    validate_base_model_manifest,
)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True, type=Path)
    parser.add_argument("--adapter", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    config = read_json(args.config)
    require_resolved_config(config)
    validate_base_model_manifest(config)
    if not args.adapter.is_dir():
        raise ValueError(f"Adapter directory does not exist: {args.adapter}.")
    if args.output.exists() and any(args.output.iterdir()):
        raise ValueError(f"Merged output directory must be new or empty: {args.output}.")

    import torch
    from peft import PeftModel
    from transformers import AutoModelForCausalLM, AutoTokenizer

    base_model = AutoModelForCausalLM.from_pretrained(
        config["baseModelPath"],
        local_files_only=True,
        trust_remote_code=False,
        torch_dtype=torch.bfloat16,
        low_cpu_mem_usage=True,
        device_map="auto",
    )
    model = PeftModel.from_pretrained(base_model, str(args.adapter), local_files_only=True)
    merged = model.merge_and_unload(safe_merge=True)
    args.output.mkdir(parents=True, exist_ok=True)
    merged.save_pretrained(args.output, safe_serialization=True, max_shard_size="5GB")
    AutoTokenizer.from_pretrained(
        config["baseModelPath"],
        local_files_only=True,
        trust_remote_code=False,
    ).save_pretrained(args.output)

    artifacts = {
        path.name: sha256_file(path)
        for path in sorted(args.output.iterdir())
        if path.is_file()
    }
    with (args.output / "merged-artifacts.json").open("w", encoding="utf-8") as output:
        json.dump({
            "schemaVersion": 1,
            "baseModelRevision": config["baseModelRevision"],
            "adapterDirectory": str(args.adapter),
            "artifacts": artifacts,
        }, output, indent=2)
        output.write("\n")


if __name__ == "__main__":
    main()
