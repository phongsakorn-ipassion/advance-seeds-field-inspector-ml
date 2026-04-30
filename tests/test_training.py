import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from advance_seeds_ml.training import (
    HardwareProfile,
    apply_hardware_profile,
    apply_overrides,
    cli_preview,
    load_training_config,
    materialize_ultralytics_dataset_config,
    resolve_training_paths,
    train_kwargs,
)


class TrainingConfigTests(unittest.TestCase):
    def test_load_training_config_coerces_values(self):
        with tempfile.TemporaryDirectory() as tmp:
            config = Path(tmp) / "train.yaml"
            config.write_text(
                "\n".join(
                    [
                        "model: yolo26n-seg.pt",
                        "data: configs/dataset.banana-v1.yaml",
                        "project: runs/banana-v1",
                        "name: banana-v1-poc",
                        "epochs: 50",
                        "batch: -1",
                        "lr0: 0.001",
                        "amp: true",
                    ]
                ),
                encoding="utf-8",
            )
            loaded = load_training_config(config)
        self.assertEqual(loaded["epochs"], 50)
        self.assertEqual(loaded["batch"], -1)
        self.assertEqual(loaded["lr0"], 0.001)
        self.assertTrue(loaded["amp"])

    def test_apply_overrides_replaces_non_none_values(self):
        config = {
            "model": "yolo26n-seg.pt",
            "data": "configs/dataset.banana-v1.yaml",
            "project": "runs/banana-v1",
            "name": "banana-v1-poc",
            "epochs": 50,
        }
        merged = apply_overrides(config, {"epochs": 3, "name": None})
        self.assertEqual(merged["epochs"], 3)
        self.assertEqual(merged["name"], "banana-v1-poc")

    def test_train_kwargs_excludes_model(self):
        kwargs = train_kwargs({"model": "yolo26n-seg.pt", "data": "data.yaml"})
        self.assertEqual(kwargs, {"data": "data.yaml"})

    def test_resolve_training_paths_anchors_data_and_project_to_root(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            resolved = resolve_training_paths(
                {"data": "configs/data.yaml", "project": "runs/banana-v1", "model": "yolo26n-seg.pt"},
                root,
            )
        self.assertEqual(resolved["data"], str((root / "configs/data.yaml").resolve()))
        self.assertEqual(resolved["project"], str((root / "runs/banana-v1").resolve()))
        self.assertEqual(resolved["model"], "yolo26n-seg.pt")

    def test_materialize_ultralytics_dataset_config_writes_absolute_dataset_root(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            config_dir = root / "configs"
            config_dir.mkdir()
            data_config = config_dir / "dataset.yaml"
            data_config.write_text(
                "\n".join(
                    [
                        "path: ../data/processed/demo",
                        "train: images/train",
                        "val: images/val",
                        "names:",
                        "  2: banana",
                        "  3: banana_spot",
                    ]
                ),
                encoding="utf-8",
            )
            resolved = materialize_ultralytics_dataset_config(
                {"data": str(data_config), "model": "yolo26n-seg.pt"},
                root / "runs" / "_runtime_datasets",
            )
            runtime_config = Path(resolved["data"])
            contents = runtime_config.read_text(encoding="utf-8")
        self.assertTrue(runtime_config.name.endswith(".ultralytics.yaml"))
        self.assertIn(f"path: {(root / 'data/processed/demo').resolve()}", contents)
        self.assertIn("2: banana", contents)
        self.assertIn("3: banana_spot", contents)

    def test_cli_preview_uses_segment_train(self):
        command = cli_preview({"model": "yolo26n-seg.pt", "data": "data.yaml", "epochs": 3})
        self.assertIn("yolo segment train", command)
        self.assertIn("model=yolo26n-seg.pt", command)
        self.assertIn("epochs=3", command)

    def test_cuda_hardware_profile_uses_gpu_auto_batch_and_amp(self):
        config = {"device": "auto", "batch": "auto", "workers": "auto", "amp": "auto", "cache": "auto"}
        profile = HardwareProfile(kind="cuda", device="0", cpu_count=12, memory_gb=32, gpu_name="RTX", gpu_memory_gb=12)
        resolved = apply_hardware_profile(config, profile)
        self.assertEqual(resolved["device"], "0")
        self.assertEqual(resolved["batch"], -1)
        self.assertEqual(resolved["workers"], 8)
        self.assertTrue(resolved["amp"])
        self.assertEqual(resolved["cache"], "ram")

    def test_mps_hardware_profile_uses_mps_safe_defaults(self):
        config = {"device": "auto", "batch": "auto", "workers": "auto", "amp": "auto", "cache": "auto"}
        profile = HardwareProfile(kind="mps", device="mps", cpu_count=10, memory_gb=16)
        resolved = apply_hardware_profile(config, profile)
        self.assertEqual(resolved["device"], "mps")
        self.assertEqual(resolved["batch"], 8)
        self.assertEqual(resolved["workers"], 6)
        self.assertFalse(resolved["amp"])
        self.assertFalse(resolved["cache"])

    def test_cpu_hardware_profile_uses_small_batch(self):
        config = {"device": "auto", "batch": "auto", "workers": "auto", "amp": "auto", "cache": "auto"}
        profile = HardwareProfile(kind="cpu", device="cpu", cpu_count=4, memory_gb=8)
        resolved = apply_hardware_profile(config, profile)
        self.assertEqual(resolved["device"], "cpu")
        self.assertEqual(resolved["batch"], 4)
        self.assertEqual(resolved["workers"], 2)
        self.assertFalse(resolved["amp"])
        self.assertFalse(resolved["cache"])

    def test_explicit_values_are_not_overwritten_by_hardware_profile(self):
        config = {"device": "cpu", "batch": 2, "workers": 1, "amp": False, "cache": False}
        profile = HardwareProfile(kind="cuda", device="0", cpu_count=12, memory_gb=32, gpu_memory_gb=12)
        resolved = apply_hardware_profile(config, profile)
        for key, value in config.items():
            self.assertEqual(resolved[key], value)
        self.assertEqual(resolved["hardware"]["kind"], "cuda")


if __name__ == "__main__":
    unittest.main()
