from __future__ import annotations

import argparse
import hashlib
import json
import os
import time
from pathlib import Path
from typing import Any

from training_common import (
    load_dataset_release,
    load_model_for_training,
    matching_target_parameter_names,
    read_json,
    sha256_file,
    validate_config,
)


def adapter_state_sha256(model) -> str:
    import torch

    digest = hashlib.sha256()
    adapter_tensors = sorted(
        (name, tensor)
        for name, tensor in model.state_dict().items()
        if "lora_" in name or "lora_embedding_" in name
    )
    if not adapter_tensors:
        raise ValueError("No trainable LoRA adapter tensors were found.")
    for name, tensor in adapter_tensors:
        digest.update(name.encode("utf-8"))
        digest.update(
            tensor.detach().to("cpu").contiguous().view(torch.uint8).numpy().tobytes()
        )
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True, type=Path)
    parser.add_argument("--overfit-one", action="store_true")
    args = parser.parse_args()

    config = read_json(args.config)
    validate_config(config)
    dataset_manifest, rows = load_dataset_release(config)
    if args.overfit_one:
        rows = rows[:1]

    hourly_price = float(os.environ.get("OVH_TRAINING_HOURLY_PRICE_USD", "0"))
    maximum_cost = float(os.environ.get("TRAINING_MAX_COMPUTE_COST_USD", "0"))
    if hourly_price <= 0 or maximum_cost <= 0:
        raise ValueError(
            "OVH_TRAINING_HOURLY_PRICE_USD and TRAINING_MAX_COMPUTE_COST_USD are required."
        )
    cost_limited_seconds = maximum_cost / hourly_price * 3600
    runtime_limit_seconds = min(
        int(config["training"]["maxRuntimeSeconds"]),
        int(cost_limited_seconds),
    )
    if runtime_limit_seconds < 60:
        raise ValueError("The approved compute budget permits less than 60 seconds.")

    import torch
    from datasets import Dataset
    from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
    from transformers import AutoTokenizer, TrainerCallback, set_seed
    from trl import SFTConfig, SFTTrainer

    set_seed(int(config["training"]["seed"]), deterministic=True)
    tokenizer = AutoTokenizer.from_pretrained(
        config["baseModelPath"],
        local_files_only=True,
        trust_remote_code=False,
    )
    model = load_model_for_training(config)
    if config["loader"]["mode"] == "bnb_nf4":
        model = prepare_model_for_kbit_training(model, use_gradient_checkpointing=True)
    model.gradient_checkpointing_enable()

    configured_targets = config["lora"].get("targetParameters") or []
    target_matches = matching_target_parameter_names(model, configured_targets)
    missing_targets = [target for target, matches in target_matches.items() if not matches]
    if missing_targets:
        raise ValueError(f"LoRA target parameters did not match the pinned model: {missing_targets}.")
    lora_arguments: dict[str, Any] = {
        "r": int(config["lora"]["rank"]),
        "lora_alpha": int(config["lora"]["alpha"]),
        "lora_dropout": float(config["lora"]["dropout"]),
        "target_modules": config["lora"]["targetModules"],
        "task_type": "CAUSAL_LM",
    }
    if configured_targets:
        lora_arguments["target_parameters"] = configured_targets
    model = get_peft_model(model, LoraConfig(**lora_arguments))
    trainable_names = sorted(name for name, parameter in model.named_parameters() if parameter.requires_grad)
    if not trainable_names:
        raise ValueError("LoRA configuration produced no trainable parameters.")
    initial_adapter_hash = adapter_state_sha256(model)

    output_directory = Path(config["outputDirectory"])
    output_directory.mkdir(parents=True, exist_ok=True)
    training = config["training"]
    training_args = SFTConfig(
        output_dir=str(output_directory / "checkpoints"),
        learning_rate=float(training["learningRate"]),
        gradient_checkpointing=True,
        num_train_epochs=float(training["epochs"]),
        max_steps=int(training["maxSteps"]),
        per_device_train_batch_size=int(training["perDeviceBatchSize"]),
        gradient_accumulation_steps=int(training["gradientAccumulationSteps"]),
        max_length=int(training["maxSequenceLength"]),
        warmup_ratio=float(training["warmupRatio"]),
        logging_steps=int(training["loggingSteps"]),
        save_steps=int(training["saveSteps"]),
        lr_scheduler_type="cosine",
        bf16=True,
        seed=int(training["seed"]),
        data_seed=int(training["seed"]),
        report_to=[],
        push_to_hub=False,
        packing=False,
    )

    class CostAndRuntimeGuard(TrainerCallback):
        def __init__(self) -> None:
            self.started_at = time.monotonic()
            self.stopped_by_guard = False

        def on_step_end(self, args, state, control, **kwargs):
            if time.monotonic() - self.started_at >= runtime_limit_seconds:
                self.stopped_by_guard = True
                control.should_training_stop = True
            return control

    guard = CostAndRuntimeGuard()
    trainer = SFTTrainer(
        model=model,
        args=training_args,
        train_dataset=Dataset.from_list([{"messages": row["messages"]} for row in rows]),
        processing_class=tokenizer,
        callbacks=[guard],
    )
    started_at = time.monotonic()
    train_result = trainer.train()
    runtime_seconds = time.monotonic() - started_at
    final_adapter_hash = adapter_state_sha256(model)
    if final_adapter_hash == initial_adapter_hash:
        raise ValueError("Adapter tensors did not change during training.")

    adapter_directory = output_directory / "adapter"
    trainer.save_model(str(adapter_directory))
    tokenizer.save_pretrained(str(adapter_directory))
    observed_cost = hourly_price * runtime_seconds / 3600
    experiment_manifest = {
        "schemaVersion": 1,
        "experimentKind": config["experimentKind"],
        "overfitOne": args.overfit_one,
        "modelFamily": config["modelFamily"],
        "baseModelRevision": config["baseModelRevision"],
        "baseModelManifestSha256": config["baseModelManifestSha256"],
        "datasetReleaseId": dataset_manifest["releaseId"],
        "datasetManifestSha256": config["datasetManifestSha256"],
        "trainingStackRevision": os.environ.get("TRAINING_STACK_REVISION", ""),
        "trainingImage": os.environ.get("TRAINING_IMAGE", ""),
        "ovhJobId": os.environ.get("OVH_AI_JOB_ID", ""),
        "approvalId": os.environ.get("TRAINING_APPROVAL_ID"),
        "hourlyPriceUsd": hourly_price,
        "maximumComputeCostUsd": maximum_cost,
        "runtimeLimitSeconds": runtime_limit_seconds,
        "runtimeSeconds": runtime_seconds,
        "observedComputeCostUsd": observed_cost,
        "stoppedByGuard": guard.stopped_by_guard,
        "examples": len(rows),
        "maxSequenceLength": int(training["maxSequenceLength"]),
        "trainableParameterNames": trainable_names,
        "configuredTargetMatches": target_matches,
        "initialAdapterSha256": initial_adapter_hash,
        "finalAdapterSha256": final_adapter_hash,
        "peakGpuMemoryBytes": torch.cuda.max_memory_allocated() if torch.cuda.is_available() else 0,
        "trainerMetrics": train_result.metrics,
        "adapterFiles": sorted(
            {
                path.name: sha256_file(path)
                for path in adapter_directory.iterdir()
                if path.is_file()
            }.items()
        ),
    }
    with (output_directory / "experiment-manifest.json").open("w", encoding="utf-8") as output:
        json.dump(experiment_manifest, output, indent=2)
        output.write("\n")


if __name__ == "__main__":
    main()
