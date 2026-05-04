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


if __name__ == "__main__":
    unittest.main()
