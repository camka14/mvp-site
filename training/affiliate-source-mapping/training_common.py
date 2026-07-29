from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
from typing import Any

HEX_SHA256_LENGTH = 64
PLACEHOLDER_MARKER = "REPLACE"


def read_json(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as source:
        value = json.load(source)
    if not isinstance(value, dict):
        raise ValueError(f"Expected a JSON object in {path}.")
    return value


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def stable_value_sha256(value: Any) -> str:
    encoded = json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def require_sha256(value: str, label: str) -> None:
    if len(value) != HEX_SHA256_LENGTH or any(character not in "0123456789abcdef" for character in value):
        raise ValueError(f"{label} must be a lowercase SHA-256 value.")


def require_resolved_config(value: Any, path: str = "config") -> None:
    if isinstance(value, str) and PLACEHOLDER_MARKER in value:
        raise ValueError(f"{path} still contains a REPLACE placeholder.")
    if isinstance(value, list):
        for index, nested in enumerate(value):
            require_resolved_config(nested, f"{path}[{index}]")
    if isinstance(value, dict):
        for key, nested in value.items():
            require_resolved_config(nested, f"{path}.{key}")


def validate_config(config: dict[str, Any]) -> None:
    require_resolved_config(config)
    if config.get("schemaVersion") != 1:
        raise ValueError("Unsupported training configuration schema.")
    if config.get("experimentKind") not in {"smoke", "full"}:
        raise ValueError("experimentKind must be smoke or full.")
    base_path = Path(config["baseModelPath"])
    dataset_path = Path(config["datasetDirectory"])
    output_path = Path(config["outputDirectory"])
    for label, path in (
        ("baseModelPath", base_path),
        ("datasetDirectory", dataset_path),
        ("outputDirectory", output_path),
    ):
        if not path.is_absolute():
            raise ValueError(f"{label} must be an absolute mounted path.")
    if not base_path.is_dir():
        raise ValueError(f"Base model directory does not exist: {base_path}.")
    if not dataset_path.is_dir():
        raise ValueError(f"Dataset directory does not exist: {dataset_path}.")
    if output_path.exists() and any(output_path.iterdir()):
        raise ValueError(f"Output directory must be new or empty: {output_path}.")
    require_sha256(config["baseModelManifestSha256"], "baseModelManifestSha256")
    require_sha256(config["datasetManifestSha256"], "datasetManifestSha256")
    validate_base_model_manifest(config)
    maximum_length = int(config["training"]["maxSequenceLength"])
    if maximum_length < 128 or maximum_length > 8192:
        raise ValueError("maxSequenceLength must be between 128 and 8192.")
    maximum_runtime = int(config["training"]["maxRuntimeSeconds"])
    if config["experimentKind"] == "smoke" and maximum_runtime > 7200:
        raise ValueError("Smoke experiments cannot exceed two hours.")
    if config["experimentKind"] == "full" and not os.environ.get("TRAINING_APPROVAL_ID", "").strip():
        raise ValueError("Full training requires TRAINING_APPROVAL_ID.")
    targets = config["lora"].get("targetParameters") or []
    if config["lora"].get("requiresReviewedTargetParameters"):
        if not targets or any(PLACEHOLDER_MARKER in target for target in targets):
            raise ValueError("The pinned model's LoRA target parameters have not been reviewed.")


def validate_base_model_manifest(config: dict[str, Any]) -> dict[str, Any]:
    manifest_path = Path(config["baseModelManifestPath"])
    if not manifest_path.is_absolute() or not manifest_path.is_file():
        raise ValueError("baseModelManifestPath must be an existing absolute file.")
    if sha256_file(manifest_path) != config["baseModelManifestSha256"]:
        raise ValueError("Base-model manifest file hash does not match the training config.")
    manifest = read_json(manifest_path)
    if manifest.get("upstreamRevision") != config["baseModelRevision"]:
        raise ValueError("Base-model revision does not match the reviewed model manifest.")
    license_review = manifest.get("license") or {}
    if not all(
        license_review.get(field) is True
        for field in (
            "commercialUseApproved",
            "modificationApproved",
            "derivativeDeploymentApproved",
        )
    ):
        raise ValueError("Base-model license permissions are not all approved.")
    if manifest.get("requiresVendorApi") is not False:
        raise ValueError("The selected base model requires a vendor API.")
    return manifest


def load_dataset_release(config: dict[str, Any]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    dataset_directory = Path(config["datasetDirectory"])
    manifest_path = dataset_directory / "manifest.json"
    if sha256_file(manifest_path) != config["datasetManifestSha256"]:
        raise ValueError("Dataset manifest file hash does not match the training config.")
    manifest = read_json(manifest_path)
    rows: list[dict[str, Any]] = []
    with (dataset_directory / "train.jsonl").open(encoding="utf-8") as source:
        for line_number, raw_line in enumerate(source, start=1):
            line = raw_line.strip()
            if not line:
                continue
            row = json.loads(line)
            if row.get("split") != "train":
                raise ValueError(f"Non-train row found on train.jsonl line {line_number}.")
            if row.get("evidenceLabel") not in {"FAITHFUL", "BLOCKED"}:
                raise ValueError(f"Unapproved evidence label on train.jsonl line {line_number}.")
            messages = row.get("messages")
            if not isinstance(messages, list) or [message.get("role") for message in messages] != [
                "system",
                "user",
                "assistant",
            ]:
                raise ValueError(f"Invalid message sequence on train.jsonl line {line_number}.")
            rows.append(row)
    if not rows:
        raise ValueError("Training release contains no approved train rows.")
    expected_hashes = manifest.get("rowSha256s") or []
    missing_hash = next(
        (stable_value_sha256(row) for row in rows if stable_value_sha256(row) not in expected_hashes),
        None,
    )
    if missing_hash:
        raise ValueError(f"Training row hash is absent from the release manifest: {missing_hash}.")
    return manifest, rows


def load_model_for_training(config: dict[str, Any]):
    import torch
    from transformers import AutoModelForCausalLM, BitsAndBytesConfig, Mxfp4Config

    loader = config["loader"]
    common = {
        "pretrained_model_name_or_path": config["baseModelPath"],
        "local_files_only": True,
        "trust_remote_code": False,
        "attn_implementation": loader["attentionImplementation"],
        "torch_dtype": torch.bfloat16,
        "use_cache": False,
        "device_map": "auto",
    }
    if loader["mode"] == "mxfp4_dequantize":
        common["quantization_config"] = Mxfp4Config(dequantize=True)
    elif loader["mode"] == "bnb_nf4":
        common["quantization_config"] = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_compute_dtype=torch.bfloat16,
            bnb_4bit_use_double_quant=True,
        )
    else:
        raise ValueError(f"Unsupported loader mode: {loader['mode']}.")
    return AutoModelForCausalLM.from_pretrained(**common)


def matching_target_parameter_names(model, configured_targets: list[str]) -> dict[str, list[str]]:
    names = [name for name, _ in model.named_parameters()]
    return {
        target: [name for name in names if name.endswith(target)]
        for target in configured_targets
    }
