import importlib.util
import json
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

    def test_tflite_export_quantized_uses_calibrated_int8_for_android(self):
        config = {"data": "/tmp/dataset.yaml", "imgsz": 640}

        kwargs = self.module.export_kwargs("tflite", config, quantize=True)

        self.assertEqual(kwargs["format"], "tflite")
        self.assertTrue(kwargs["int8"])
        self.assertEqual(kwargs["data"], "/tmp/dataset.yaml")
        self.assertEqual(kwargs["imgsz"], 640)
        self.assertEqual(kwargs["batch"], 1)
        self.assertIsInstance(kwargs["fraction"], float)

    def test_tflite_export_unquantized_is_fp32_for_android(self):
        config = {"data": "/tmp/dataset.yaml", "imgsz": 640}

        kwargs = self.module.export_kwargs("tflite", config, quantize=False)

        self.assertEqual(kwargs["format"], "tflite")
        self.assertEqual(kwargs["imgsz"], 640)
        self.assertNotIn("int8", kwargs)

    def test_coreml_export_quantized_uses_fp16_for_ios(self):
        config = {"data": "/tmp/dataset.yaml", "imgsz": 640}

        kwargs = self.module.export_kwargs("coreml", config, quantize=True)

        self.assertEqual(kwargs["format"], "coreml")
        self.assertTrue(kwargs["half"])
        self.assertNotIn("int8", kwargs)
        self.assertNotIn("data", kwargs)

    def test_coreml_export_unquantized_is_fp32_for_ios(self):
        config = {"data": "/tmp/dataset.yaml", "imgsz": 640}

        kwargs = self.module.export_kwargs("coreml", config, quantize=False)

        self.assertEqual(kwargs["format"], "coreml")
        self.assertEqual(kwargs["imgsz"], 640)
        self.assertNotIn("half", kwargs)

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

    def test_verify_bundle_layout_passes_when_splits_present(self):
        # type-first archive, type-first YAML splits — should not raise.
        self.module._verify_bundle_layout(
            ["images/train/a.jpg", "images/val/b.jpg", "labels/train/a.txt"],
            {"train": "images/train", "val": "images/val", "test": "images/test"},
            None,
        )

    def test_verify_bundle_layout_passes_for_repo_relative_archive(self):
        self.module._verify_bundle_layout(
            ["data/processed/images/train/a.jpg", "data/processed/images/val/b.jpg"],
            {"train": "images/train", "val": "images/val"},
            Path("data/processed"),
        )

    def test_verify_bundle_layout_raises_on_split_first_yaml_vs_type_first_bundle(self):
        # The reported failure: YAML still uses Roboflow split-first paths but the
        # bundle is the clean type-first layout. Must fail early and clearly.
        with self.assertRaises(SystemExit) as ctx:
            self.module._verify_bundle_layout(
                ["images/train/a.jpg", "images/val/b.jpg", "labels/train/a.txt"],
                {"train": "train/images", "val": "valid/images", "test": "test/images"},
                None,
            )
        message = str(ctx.exception)
        # names the offending declared split and surfaces what the bundle holds.
        self.assertIn("valid/images", message)
        self.assertIn("images/val", message)

    def test_coreml_export_omits_detect_only_nms_args(self):
        # nms/max_det/iou/conf are Detect-only in Ultralytics >=8.4.83 and are
        # rejected by the litert exporter for segmentation; they must not appear
        # in export kwargs. end2end=False is still required. See D-TFLITE-ONNX2TF.
        config = {"data": "/tmp/dataset.yaml", "imgsz": 640}
        kwargs = self.module.export_kwargs("coreml", config, True)
        self.assertIs(kwargs["end2end"], False)
        for arg in ("nms", "max_det", "iou", "conf"):
            self.assertNotIn(arg, kwargs)

    def test_tflite_subprocess_cmd_hides_gpu_and_passes_kwargs(self):
        # The onnx2tf conversion must run in a fresh subprocess with the GPU
        # hidden from the start: in-process CUDA_VISIBLE_DEVICES changes are
        # ignored once PyTorch has initialized CUDA during training, so TF still
        # grabs the GPU and dies on Blackwell (cc 12.0). See drift D-TFLITE-ONNX2TF.
        kwargs = {"format": "tflite", "imgsz": 640, "end2end": False, "nms": True}
        argv, env = self.module.build_tflite_subprocess_cmd(Path("/runs/best.pt"), kwargs)
        self.assertEqual(env["CUDA_VISIBLE_DEVICES"], "")
        self.assertIn("/runs/best.pt", argv)
        # kwargs are JSON-round-tripped through the subprocess argv
        self.assertIn(json.dumps(kwargs), argv)

    def test_parse_tflite_artifact_reads_marker_line(self):
        stdout = "noise\nTFLITE_ARTIFACT::/runs/best_saved_model/best_int8.tflite\nmore noise\n"
        self.assertEqual(
            self.module.parse_tflite_artifact(stdout),
            Path("/runs/best_saved_model/best_int8.tflite"),
        )

    def test_parse_tflite_artifact_returns_none_without_marker(self):
        self.assertIsNone(self.module.parse_tflite_artifact("just logs\nno artifact\n"))

    def test_export_forces_one_to_many_head_so_onnx2tf_can_convert(self):
        # YOLO26's default one-to-one (end2end) head cannot be converted by
        # onnx2tf. end2end=False selects the one-to-many head (raw 1x41x8400
        # output) that converts cleanly; the app runs NMS downstream.
        config = {"data": "/tmp/dataset.yaml", "imgsz": 640}
        for kind in ("tflite", "coreml"):
            kwargs = self.module.export_kwargs(kind, config, True)
            self.assertIn("end2end", kwargs, f"{kind} missing end2end")
            self.assertFalse(kwargs["end2end"], f"{kind} must use one-to-many head")
            self.assertNotIn("nms", kwargs, f"{kind} must not pass Detect-only nms")

    def test_coreml_export_honours_run_overrides(self):
        config = {
            "data": "/tmp/dataset.yaml",
            "imgsz": 640,
            "exportOptions": {
                "ios": {"quantize": False, "nms": {"maxDet": 150, "iouThreshold": 0.55, "confThreshold": 0.3}},
                "android": {"quantize": True},
            },
        }
        # Operator NMS overrides are still resolved (and recorded in metadata),
        # but are no longer forwarded to the (Detect-only) export args.
        resolved = self.module.load_export_options(config)
        self.assertEqual(resolved["ios"]["nms"]["maxDet"], 150)
        self.assertAlmostEqual(resolved["ios"]["nms"]["iouThreshold"], 0.55)
        kwargs = self.module.export_kwargs("coreml", config, resolved["ios"]["quantize"], resolved["ios"]["nms"])
        for arg in ("nms", "max_det", "iou", "conf"):
            self.assertNotIn(arg, kwargs)
        self.assertNotIn("half", kwargs)

    def test_tflite_export_omits_detect_only_nms(self):
        config = {"data": "/tmp/dataset.yaml", "imgsz": 640}
        kwargs = self.module.export_kwargs("tflite", config, False)
        self.assertIs(kwargs["end2end"], False)
        for arg in ("nms", "max_det", "iou", "conf"):
            self.assertNotIn(arg, kwargs)

    def test_load_export_options_clamps_out_of_range(self):
        config = {"exportOptions": {"ios": {"quantize": True, "nms": {"maxDet": 9999, "iouThreshold": 2, "confThreshold": -1}}, "android": {"quantize": True}}}
        resolved = self.module.load_export_options(config)
        self.assertEqual(resolved["ios"]["nms"]["maxDet"], 300)
        self.assertEqual(resolved["ios"]["nms"]["iouThreshold"], 1.0)
        self.assertEqual(resolved["ios"]["nms"]["confThreshold"], 0.0)

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
