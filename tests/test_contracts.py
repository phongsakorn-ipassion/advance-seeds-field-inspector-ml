import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from advance_seeds_ml.contracts import (
    ModelMetadata,
    load_class_names,
    load_metadata,
    raw_seg_output_shape,
    write_metadata,
)

POC_CLASSES = ["banana", "banana_spot"]


class LoadClassNamesTests(unittest.TestCase):
    def _write_yaml(self, tmp: str, body: str) -> Path:
        path = Path(tmp) / "dataset.yaml"
        path.write_text(body, encoding="utf-8")
        return path

    def test_reads_dict_form_names(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = self._write_yaml(
                tmp,
                "names:\n  0: banana\n  1: banana_spot\n  2: pepper\n  3: watermelon\n",
            )
            self.assertEqual(
                load_class_names(path),
                ["banana", "banana_spot", "pepper", "watermelon"],
            )

    def test_reads_list_form_names(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = self._write_yaml(tmp, "names: ['banana', 'corn', 'cucumber']\n")
            self.assertEqual(load_class_names(path), ["banana", "corn", "cucumber"])

    def test_orders_by_index_regardless_of_key_order(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = self._write_yaml(
                tmp, "names:\n  2: pepper\n  0: banana\n  1: corn\n"
            )
            self.assertEqual(load_class_names(path), ["banana", "corn", "pepper"])

    def test_empty_or_missing_names_raises(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = self._write_yaml(tmp, "train: images/train\n")
            with self.assertRaisesRegex(ValueError, "names"):
                load_class_names(path)


class ContractTests(unittest.TestCase):
    def test_metadata_roundtrip(self):
        metadata = ModelMetadata(
            model_name="yolo26n-seg",
            model_version="0.1.0",
            task="instance-segmentation",
            input_size=640,
            class_names=POC_CLASSES,
            output_kind="segmentation",
            output_shape=[1, 300, 38],
            score_threshold=0.35,
            iou_threshold=0.6,
        )
        with tempfile.TemporaryDirectory() as tmp:
            path = write_metadata(metadata, Path(tmp) / "model-metadata.json")
            loaded = load_metadata(path)
        self.assertEqual(loaded.model_name, "yolo26n-seg")
        self.assertEqual(loaded.source_weights, "yolo26n-seg.pt")
        self.assertEqual(loaded.mobile_tflite_filename, "yolo11n-seeds.tflite")
        self.assertEqual(loaded.class_names, POC_CLASSES)
        self.assertEqual(loaded.calibration.default_marker_mm, 50.0)

    def test_metadata_rejects_empty_classes(self):
        metadata = ModelMetadata(
            model_name="model",
            model_version="0.1.0",
            task="instance-segmentation",
            input_size=640,
            class_names=[],
            output_kind="segmentation",
            output_shape=[1, 300, 38],
            score_threshold=0.35,
            iou_threshold=0.6,
        )
        with self.assertRaisesRegex(ValueError, "class_names"):
            metadata.validate()

    def test_written_metadata_is_app_facing_json(self):
        metadata = ModelMetadata(
            model_name="model",
            model_version="0.1.0",
            task="instance-segmentation",
            input_size=640,
            class_names=POC_CLASSES,
            output_kind="segmentation",
            output_shape=[1, 300, 38],
            score_threshold=0.35,
            iou_threshold=0.6,
        )
        with tempfile.TemporaryDirectory() as tmp:
            path = write_metadata(metadata, Path(tmp) / "model-metadata.json")
            data = json.loads(path.read_text())
        self.assertEqual(data["class_names"], POC_CLASSES)
        self.assertEqual(data["calibration"]["supported_sources"], ["aruco", "lidar", "manual"])
        self.assertEqual(data["acceptance_targets"]["measurement_error_mm"], 0.5)


    def test_raw_seg_output_shape_depends_on_class_count(self):
        # feature dim = 4 box + nc + 32 mask coeffs; anchors = 8400 at imgsz 640
        self.assertEqual(raw_seg_output_shape(2), [1, 38, 8400])
        self.assertEqual(raw_seg_output_shape(5), [1, 41, 8400])
        self.assertEqual(raw_seg_output_shape(1, imgsz=320), [1, 37, 2100])

    def test_segmentation_raw_metadata_roundtrips_with_nms_flag_and_protos(self):
        metadata = ModelMetadata(
            model_name="yolo26n-seg",
            model_version="0.1.0",
            task="instance-segmentation",
            input_size=640,
            class_names=["banana", "corn", "cucumber", "pepper", "watermelon"],
            output_kind="segmentation_raw",
            output_shape=raw_seg_output_shape(5),
            mask_proto_shape=[1, 32, 160, 160],
            nms_applied=False,
            score_threshold=0.35,
            iou_threshold=0.6,
        )
        with tempfile.TemporaryDirectory() as tmp:
            path = write_metadata(metadata, Path(tmp) / "model-metadata.json")
            data = json.loads(path.read_text())
            loaded = load_metadata(path)
        self.assertEqual(data["output_kind"], "segmentation_raw")
        self.assertEqual(data["output_shape"], [1, 41, 8400])
        self.assertEqual(data["mask_proto_shape"], [1, 32, 160, 160])
        self.assertIs(data["nms_applied"], False)
        # round-trips back through load_metadata
        self.assertIs(loaded.nms_applied, False)
        self.assertEqual(loaded.mask_proto_shape, [1, 32, 160, 160])

    def test_legacy_metadata_without_new_fields_still_loads(self):
        # Backward compat: metadata written before raw seg export omits the new
        # fields; defaults must apply (nms_applied True, mask_proto_shape None).
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "model-metadata.json"
            path.write_text(json.dumps({
                "model_name": "m", "model_version": "0.1.0",
                "task": "instance-segmentation", "input_size": 640,
                "class_names": POC_CLASSES, "output_kind": "segmentation",
                "output_shape": [1, 300, 38], "score_threshold": 0.35,
                "iou_threshold": 0.6,
            }))
            loaded = load_metadata(path)
        self.assertIs(loaded.nms_applied, True)
        self.assertIsNone(loaded.mask_proto_shape)


if __name__ == "__main__":
    unittest.main()
