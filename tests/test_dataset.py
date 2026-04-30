import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from advance_seeds_ml.dataset import validate_yolo_seg_dataset, validate_yolo_seg_line


class DatasetTests(unittest.TestCase):
    def test_valid_yolo_seg_line(self):
        issue = validate_yolo_seg_line(
            "0 0.10 0.10 0.20 0.10 0.20 0.20",
            {0: "seed"},
        )
        self.assertIsNone(issue)

    def test_invalid_yolo_seg_line_rejects_bad_coordinates(self):
        issue = validate_yolo_seg_line(
            "0 0.10 0.10 1.20 0.10 0.20 0.20",
            {0: "seed"},
        )
        self.assertIn("outside normalized range", issue or "")

    def test_dataset_report_counts_splits_and_classes(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            dataset = root / "dataset"
            for split in ("train", "val", "test"):
                (dataset / "images" / split).mkdir(parents=True)
                (dataset / "labels" / split).mkdir(parents=True)
                (dataset / "images" / split / f"{split}.jpg").write_bytes(b"fake")
                (dataset / "labels" / split / f"{split}.txt").write_text(
                    "0 0.10 0.10 0.20 0.10 0.20 0.20\n",
                    encoding="utf-8",
                )
            config = root / "dataset.yaml"
            config.write_text(
                f"""
path: {dataset}
train: images/train
val: images/val
test: images/test
names:
  0: seed
""",
                encoding="utf-8",
            )

            report = validate_yolo_seg_dataset(config)

        self.assertTrue(report.ok)
        self.assertEqual(report.split_images, {"train": 1, "val": 1, "test": 1})
        self.assertEqual(report.class_counts, {0: 3})


if __name__ == "__main__":
    unittest.main()
