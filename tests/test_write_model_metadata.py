import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import write_model_metadata as wmm


V10_YAML = (
    "names:\n"
    "  0: banana\n  1: bitter_gourd\n  2: cantaloupe\n  3: corn\n  4: cucumber\n"
    "  5: eggplant\n  6: pepper\n  7: pumpkin\n  8: watermelon\n  9: wax_gourd\n"
)


class WriteModelMetadataTests(unittest.TestCase):
    def test_dataset_config_derives_classes_and_shape(self):
        with tempfile.TemporaryDirectory() as tmp:
            data_yaml = Path(tmp) / "dataset.yaml"
            data_yaml.write_text(V10_YAML, encoding="utf-8")
            out = Path(tmp) / "model-metadata.json"
            rc = wmm.main([
                "--model-name", "yolo26n-seg",
                "--model-version", "0.1.0",
                "--dataset-config", str(data_yaml),
                "--output", str(out),
            ])
            self.assertEqual(rc, 0)
            data = json.loads(out.read_text())
        self.assertEqual(len(data["class_names"]), 10)
        self.assertEqual(data["class_names"][0], "banana")
        self.assertEqual(data["class_names"][8], "watermelon")
        # raw-seg default: 4 + 10 + 32 = 46 features over 8400 anchors
        self.assertEqual(data["output_shape"], [1, 46, 8400])

    def test_classes_and_dataset_config_are_mutually_exclusive(self):
        with tempfile.TemporaryDirectory() as tmp:
            data_yaml = Path(tmp) / "dataset.yaml"
            data_yaml.write_text(V10_YAML, encoding="utf-8")
            with self.assertRaises(SystemExit):
                wmm.main([
                    "--model-name", "m", "--model-version", "0.1.0",
                    "--classes", "banana",
                    "--dataset-config", str(data_yaml),
                    "--output", str(Path(tmp) / "out.json"),
                ])

    def test_requires_one_of_classes_or_dataset_config(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(SystemExit):
                wmm.main([
                    "--model-name", "m", "--model-version", "0.1.0",
                    "--output", str(Path(tmp) / "out.json"),
                ])


if __name__ == "__main__":
    unittest.main()
