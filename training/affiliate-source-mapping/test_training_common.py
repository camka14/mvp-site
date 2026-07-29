from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from training_common import (
    load_dataset_release,
    sha256_file,
    stable_value_sha256,
    validate_config,
)


class TrainingCommonTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.base = self.root / "base"
        self.dataset = self.root / "dataset"
        self.base.mkdir()
        self.dataset.mkdir()

        self.base_manifest = {
            "schemaVersion": 1,
            "upstreamRevision": "base-revision",
            "license": {
                "commercialUseApproved": True,
                "modificationApproved": True,
                "derivativeDeploymentApproved": True,
            },
            "requiresVendorApi": False,
        }
        self.base_manifest_path = self.base / "model-manifest.json"
        self.base_manifest_path.write_text(
            json.dumps(self.base_manifest),
            encoding="utf-8",
        )
        self.row = {
            "schemaVersion": 1,
            "exampleId": "example_1",
            "split": "train",
            "registrableDomain": "example.test",
            "evidenceLabel": "BLOCKED",
            "sourceEnvelopeSha256": "a" * 64,
            "messages": [
                {"role": "system", "content": "system"},
                {"role": "user", "content": "{}"},
                {"role": "assistant", "content": "{}"},
            ],
        }
        self.dataset_manifest = {
            "schemaVersion": 1,
            "releaseId": "release-v1",
            "rowSha256s": [stable_value_sha256(self.row)],
        }
        self.dataset_manifest_path = self.dataset / "manifest.json"
        self.dataset_manifest_path.write_text(
            json.dumps(self.dataset_manifest),
            encoding="utf-8",
        )
        (self.dataset / "train.jsonl").write_text(
            f"{json.dumps(self.row)}\n",
            encoding="utf-8",
        )
        self.config = {
            "schemaVersion": 1,
            "experimentKind": "smoke",
            "modelFamily": "fixture",
            "baseModelPath": str(self.base),
            "baseModelManifestPath": str(self.base_manifest_path),
            "baseModelRevision": "base-revision",
            "baseModelManifestSha256": sha256_file(self.base_manifest_path),
            "datasetDirectory": str(self.dataset),
            "datasetManifestSha256": sha256_file(self.dataset_manifest_path),
            "outputDirectory": str(self.root / "output"),
            "loader": {"mode": "bnb_nf4", "attentionImplementation": "sdpa"},
            "lora": {
                "targetParameters": [],
                "requiresReviewedTargetParameters": False,
            },
            "training": {
                "maxSequenceLength": 2048,
                "maxRuntimeSeconds": 7200,
            },
        }

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def test_accepts_reviewed_local_release_and_checks_row_hash(self) -> None:
        validate_config(self.config)
        manifest, rows = load_dataset_release(self.config)
        self.assertEqual(manifest["releaseId"], "release-v1")
        self.assertEqual(rows, [self.row])

    def test_rejects_license_failure_and_unreviewed_targets(self) -> None:
        self.base_manifest["license"]["modificationApproved"] = False
        self.base_manifest_path.write_text(
            json.dumps(self.base_manifest),
            encoding="utf-8",
        )
        self.config["baseModelManifestSha256"] = sha256_file(self.base_manifest_path)
        with self.assertRaisesRegex(ValueError, "license permissions"):
            validate_config(self.config)

        self.base_manifest["license"]["modificationApproved"] = True
        self.base_manifest_path.write_text(
            json.dumps(self.base_manifest),
            encoding="utf-8",
        )
        self.config["baseModelManifestSha256"] = sha256_file(self.base_manifest_path)
        self.config["lora"] = {
            "targetParameters": ["REPLACE_AFTER_INSPECTION"],
            "requiresReviewedTargetParameters": True,
        }
        with self.assertRaisesRegex(ValueError, "REPLACE placeholder"):
            validate_config(self.config)


if __name__ == "__main__":
    unittest.main()
