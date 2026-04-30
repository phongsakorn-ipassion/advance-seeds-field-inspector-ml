import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from advance_seeds_ml.training import apply_overrides, cli_preview, load_training_config, train_kwargs


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

    def test_cli_preview_uses_segment_train(self):
        command = cli_preview({"model": "yolo26n-seg.pt", "data": "data.yaml", "epochs": 3})
        self.assertIn("yolo segment train", command)
        self.assertIn("model=yolo26n-seg.pt", command)
        self.assertIn("epochs=3", command)


if __name__ == "__main__":
    unittest.main()
