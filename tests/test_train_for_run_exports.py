import importlib.util
import os
import tempfile
import unittest
from pathlib import Path


def load_train_for_run():
    script_path = Path(__file__).resolve().parents[1] / "scripts" / "train_for_run.py"
    spec = importlib.util.spec_from_file_location("train_for_run", script_path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


class TrainForRunExportTests(unittest.TestCase):
    def setUp(self):
        self.module = load_train_for_run()

    def test_tflite_export_uses_calibrated_int8_for_android(self):
        config = {"data": "/tmp/dataset.yaml", "imgsz": 640}

        kwargs = self.module.export_kwargs("tflite", config, {"ADVANCE_SEEDS_QUANT_FRACTION": "0.5"})

        self.assertEqual(kwargs["format"], "tflite")
        self.assertTrue(kwargs["int8"])
        self.assertEqual(kwargs["data"], "/tmp/dataset.yaml")
        self.assertEqual(kwargs["imgsz"], 640)
        self.assertEqual(kwargs["batch"], 1)
        self.assertEqual(kwargs["fraction"], 0.5)

    def test_coreml_export_defaults_to_fp16_for_ios(self):
        config = {"data": "/tmp/dataset.yaml", "imgsz": 640}

        kwargs = self.module.export_kwargs("coreml", config, {})

        self.assertEqual(kwargs["format"], "coreml")
        self.assertTrue(kwargs["half"])
        self.assertNotIn("int8", kwargs)
        self.assertNotIn("data", kwargs)

    def test_coreml_int8_can_be_enabled_explicitly(self):
        config = {"data": "/tmp/dataset.yaml", "imgsz": 640}

        kwargs = self.module.export_kwargs(
            "coreml",
            config,
            {"ADVANCE_SEEDS_COREML_INT8": "true", "ADVANCE_SEEDS_QUANT_FRACTION": "0.25"},
        )

        self.assertTrue(kwargs["int8"])
        self.assertEqual(kwargs["data"], "/tmp/dataset.yaml")
        self.assertEqual(kwargs["fraction"], 0.25)

    def test_artifact_metadata_records_quantization(self):
        metadata = self.module.artifact_metadata(
            kind="tflite",
            artifact=type("Artifact", (), {"r2_key": "runs/x/model.tflite", "size_bytes": 10, "content_hash": "sha256:abc"})(),
            quantization={"precision": "int8", "calibration": "representative"},
        )

        self.assertEqual(metadata["r2_key"], "runs/x/model.tflite")
        self.assertEqual(metadata["quantization"]["precision"], "int8")

    def test_artifact_metadata_records_pytorch_fp32(self):
        metadata = self.module.artifact_metadata(
            kind="pytorch",
            artifact=type("Artifact", (), {"r2_key": "runs/x/model.pt", "size_bytes": 20, "content_hash": "sha256:pt"})(),
            quantization={"precision": "fp32", "method": "none"},
        )

        self.assertEqual(metadata["r2_key"], "runs/x/model.pt")
        self.assertEqual(metadata["size_bytes"], 20)
        self.assertEqual(metadata["quantization"]["precision"], "fp32")

    def test_normalize_metric_summary_preserves_raw_and_skips_missing(self):
        summary = self.module.normalize_metric_summary({
            "metrics/mAP50(B)": 0.82,
            "metrics/mAP50-95(B)": 0.74,
            "metrics/precision(B)": 0.8,
            "metrics/recall(B)": 0.76,
            "metrics/mAP50(M)": 0.72,
            "metrics/mAP50-95(M)": 0.7,
            "ignored": "not numeric",
        })

        self.assertEqual(summary["map50"], 0.82)
        self.assertEqual(summary["map5095"], 0.74)
        self.assertEqual(summary["precision"], 0.8)
        self.assertEqual(summary["recall"], 0.76)
        self.assertEqual(summary["maskMap50"], 0.72)
        self.assertEqual(summary["maskMap5095"], 0.7)
        self.assertNotIn("ignored", summary["raw"])

    def test_resolve_pytorch_weights_prefers_best(self):
        with tempfile.TemporaryDirectory() as tmp:
            save_dir = Path(tmp)
            weights = save_dir / "weights"
            weights.mkdir()
            (weights / "last.pt").write_bytes(b"last")
            (weights / "best.pt").write_bytes(b"best")

            resolved = self.module.resolve_pytorch_weights(save_dir)

        self.assertEqual(resolved.name, "best.pt")

    def test_resolve_pytorch_weights_falls_back_to_last(self):
        with tempfile.TemporaryDirectory() as tmp:
            save_dir = Path(tmp)
            weights = save_dir / "weights"
            weights.mkdir()
            (weights / "last.pt").write_bytes(b"last")

            resolved = self.module.resolve_pytorch_weights(save_dir)

        self.assertEqual(resolved.name, "last.pt")

    def test_validate_local_qa_artifact_rejects_missing_pytorch_metadata(self):
        with self.assertRaisesRegex(ValueError, "artifacts.pytorch"):
            self.module.validate_local_qa_artifact({"artifacts": {}}, "runs/x/model.pt")

    def test_validate_local_qa_artifact_rejects_non_pt_key(self):
        metadata = {
            "artifacts": {
                "pytorch": {
                    "r2_key": "runs/x/model.tflite",
                    "quantization": {"precision": "fp32", "method": "none"},
                }
            }
        }

        with self.assertRaisesRegex(ValueError, ".pt"):
            self.module.validate_local_qa_artifact(metadata, "runs/x/model.tflite")

    def test_dataset_bundle_root_layout_extracts_to_dataset_root(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            dataset_root = repo / "data" / "processed"

            target = self.module._dataset_bundle_extract_target(
                ["images/train/a.jpg", "labels/train/a.txt"],
                {"train": "images/train", "val": "images/val"},
                dataset_root,
                repo,
                Path("data/processed"),
            )

        self.assertEqual(target, dataset_root)

    def test_dataset_bundle_repo_relative_layout_extracts_to_repo_root(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            dataset_root = repo / "data" / "processed"

            target = self.module._dataset_bundle_extract_target(
                ["data/processed/images/train/a.jpg", "data/processed/labels/train/a.txt"],
                {"train": "images/train", "val": "images/val"},
                dataset_root,
                repo,
                Path("data/processed"),
            )

        self.assertEqual(target, repo)

    def test_build_training_config_uses_dashboard_hyperparameter_contract(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            dataset = repo / "dataset.yaml"
            dataset.write_text("path: .\ntrain: images/train\nval: images/val\nnames:\n  0: banana\n", encoding="utf-8")

            config = self.module.build_training_config(
                {
                    "id": "run-1",
                    "config_yaml": {
                        "dataset": str(dataset),
                        "source_weights": "yolo26n-seg.pt",
                        "hyperparameters": {
                            "epochs": 3,
                            "imgsz": 320,
                            "batch": 16,
                            "patience": 7,
                            "lr0": 0.002,
                            "optimizer": "AdamW",
                            "mosaic": 0.5,
                            "maskRatio": 2,
                        },
                    },
                },
                repo,
                client=None,
            )

        self.assertEqual(config["epochs"], 3)
        self.assertEqual(config["imgsz"], 320)
        self.assertEqual(config["batch"], 16)
        self.assertEqual(config["patience"], 7)
        self.assertEqual(config["lr0"], 0.002)
        self.assertNotIn("optimizer", config)
        self.assertNotIn("mosaic", config)
        self.assertNotIn("mask_ratio", config)


if __name__ == "__main__":
    unittest.main()
