import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from advance_seeds_ml.contracts import ModelMetadata, load_metadata, write_metadata


class ContractTests(unittest.TestCase):
    def test_metadata_roundtrip(self):
        metadata = ModelMetadata(
            model_name="yolo26n-seg",
            model_version="0.1.0",
            task="instance-segmentation",
            input_size=640,
            class_names=["seed", "damaged_seed"],
            output_kind="nms",
            output_shape=[1, 300, 6],
            score_threshold=0.5,
            iou_threshold=0.75,
        )
        with tempfile.TemporaryDirectory() as tmp:
            path = write_metadata(metadata, Path(tmp) / "model-metadata.json")
            loaded = load_metadata(path)
        self.assertEqual(loaded.model_name, "yolo26n-seg")
        self.assertEqual(loaded.class_names, ["seed", "damaged_seed"])
        self.assertEqual(loaded.calibration.default_marker_mm, 50.0)

    def test_metadata_rejects_empty_classes(self):
        metadata = ModelMetadata(
            model_name="model",
            model_version="0.1.0",
            task="instance-segmentation",
            input_size=640,
            class_names=[],
            output_kind="nms",
            output_shape=[1, 300, 6],
            score_threshold=0.5,
            iou_threshold=0.75,
        )
        with self.assertRaisesRegex(ValueError, "class_names"):
            metadata.validate()

    def test_written_metadata_is_app_facing_json(self):
        metadata = ModelMetadata(
            model_name="model",
            model_version="0.1.0",
            task="instance-segmentation",
            input_size=640,
            class_names=["seed"],
            output_kind="nms",
            output_shape=[1, 300, 6],
            score_threshold=0.5,
            iou_threshold=0.75,
        )
        with tempfile.TemporaryDirectory() as tmp:
            path = write_metadata(metadata, Path(tmp) / "model-metadata.json")
            data = json.loads(path.read_text())
        self.assertEqual(data["calibration"]["supported_sources"], ["aruco", "lidar", "manual"])
        self.assertEqual(data["acceptance_targets"]["measurement_error_mm"], 0.5)


if __name__ == "__main__":
    unittest.main()
