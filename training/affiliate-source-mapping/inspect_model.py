from __future__ import annotations

import argparse
import json
from pathlib import Path

from training_common import (
    load_model_for_training,
    matching_target_parameter_names,
    read_json,
    require_resolved_config,
)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    config = read_json(args.config)
    require_resolved_config(config)
    model = load_model_for_training(config)
    module_names = sorted(name for name, _ in model.named_modules())
    parameter_names = sorted(name for name, _ in model.named_parameters())
    configured_targets = config["lora"].get("targetParameters") or []
    report = {
        "schemaVersion": 1,
        "modelFamily": config["modelFamily"],
        "baseModelRevision": config["baseModelRevision"],
        "moduleCount": len(module_names),
        "parameterCount": len(parameter_names),
        "configuredTargetMatches": matching_target_parameter_names(model, configured_targets),
        "expertModuleNames": [
            name for name in module_names if "expert" in name.lower() or "moe" in name.lower()
        ],
        "expertParameterNames": [
            name for name in parameter_names if "expert" in name.lower() or "moe" in name.lower()
        ],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as output:
        json.dump(report, output, indent=2)
        output.write("\n")


if __name__ == "__main__":
    main()
