import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import write_export_contract as wec


BASE_CONTRACT = {
    "model_name": "yolo26n-seg",
    "model_version": "0.1.0",
    "task": "instance-segmentation",
    "input_size": 640,
    "source_weights": "yolo26n-seg.pt",
    "mobile_tflite_filename": "yolo11n-seeds.tflite",
    "class_names": ["banana", "banana_spot"],
    "output_kind": "segmentation_raw",
    "output_shape_rule": {
        "layout": "[1, 4 + num_classes + 32, anchors]",
        "num_classes_source": "model-metadata.json class_names length",
        "anchors": 8400,
    },
    "mask_proto_shape": [1, 32, 160, 160],
    "nms_applied": False,
    "score_threshold": 0.35,
    "iou_threshold": 0.6,
    "calibration": {
        "required": True,
        "supported_sources": ["aruco", "lidar", "manual"],
        "default_marker_mm": 50.0,
    },
    "acceptance_targets": {
        "segmentation_map": 0.85,
        "mask_map": 0.8,
        "measurement_error_mm": 0.5,
    },
}

V10_YAML = (
    "names:\n"
    "  0: banana\n  1: bitter_gourd\n  2: cantaloupe\n  3: corn\n  4: cucumber\n"
    "  5: eggplant\n  6: pepper\n  7: pumpkin\n  8: watermelon\n  9: wax_gourd\n"
)


class WriteExportContractTests(unittest.TestCase):
    def test_regenerates_contract_for_v10(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp) / "base.json"
            base.write_text(json.dumps(BASE_CONTRACT), encoding="utf-8")
            data_yaml = Path(tmp) / "dataset.v10.yaml"
            data_yaml.write_text(V10_YAML, encoding="utf-8")
            out = Path(tmp) / "contract.json"

            rc = wec.main([
                "--dataset-config", str(data_yaml),
                "--base", str(base),
                "--output", str(out),
            ])
            self.assertEqual(rc, 0)
            data = json.loads(out.read_text())

        # class_names snapshot is derived from the YAML
        self.assertEqual(len(data["class_names"]), 10)
        self.assertEqual(data["class_names"][0], "banana")
        self.assertEqual(data["class_names"][9], "wax_gourd")

        # rule-based: the contract does NOT freeze a class-count-dependent
        # output_shape literal; it keeps the layout rule instead. The concrete
        # shape lives in each model's model-metadata.json.
        self.assertNotIn("output_shape", data)
        self.assertEqual(data["output_shape_rule"]["anchors"], 8400)
        self.assertIn("4 + num_classes + 32", data["output_shape_rule"]["layout"])

        # frozen fields preserved from the base
        self.assertEqual(data["mobile_tflite_filename"], "yolo11n-seeds.tflite")
        self.assertEqual(data["score_threshold"], 0.35)
        self.assertEqual(data["iou_threshold"], 0.6)
        self.assertEqual(data["calibration"]["supported_sources"], ["aruco", "lidar", "manual"])
        self.assertEqual(data["acceptance_targets"]["measurement_error_mm"], 0.5)
        self.assertIs(data["nms_applied"], False)
        self.assertEqual(data["mask_proto_shape"], [1, 32, 160, 160])


if __name__ == "__main__":
    unittest.main()
