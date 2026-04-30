import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from advance_seeds_ml.banana_dataset import (
    count_valid_remapped_rows,
    remap_label_line,
    remap_label_text,
    write_dataset_yaml,
)


class BananaDatasetTests(unittest.TestCase):
    def test_remap_label_line_maps_banana_to_canonical_id(self):
        self.assertEqual(remap_label_line("0 0.1 0.2 0.3 0.4 0.5 0.6"), "2 0.1 0.2 0.3 0.4 0.5 0.6")

    def test_remap_label_line_maps_banana_spot_to_canonical_id(self):
        self.assertEqual(remap_label_line("1 0.1 0.2 0.3 0.4 0.5 0.6"), "3 0.1 0.2 0.3 0.4 0.5 0.6")

    def test_remap_label_text_preserves_multiple_rows(self):
        text = "0 0.1 0.2 0.3 0.4 0.5 0.6\n1 0.2 0.2 0.4 0.4 0.6 0.6\n"
        self.assertEqual(
            remap_label_text(text),
            "2 0.1 0.2 0.3 0.4 0.5 0.6\n3 0.2 0.2 0.4 0.4 0.6 0.6\n",
        )

    def test_remap_label_line_rejects_unmapped_class(self):
        with self.assertRaisesRegex(ValueError, "not mapped"):
            remap_label_line("4 0.1 0.2 0.3 0.4 0.5 0.6")

    def test_remap_label_line_rejects_box_style_row(self):
        with self.assertRaisesRegex(ValueError, "at least 3 polygon points"):
            remap_label_line("1 0.4 0.4 0.1 0.1")

    def test_remap_label_text_can_skip_invalid_rows(self):
        text = "0 0.1 0.2 0.3 0.4 0.5 0.6\n1 0.4 0.4 0.1 0.1\n"
        self.assertEqual(remap_label_text(text, skip_invalid=True), "2 0.1 0.2 0.3 0.4 0.5 0.6\n")

    def test_count_valid_remapped_rows_reports_skipped_rows(self):
        text = "0 0.1 0.2 0.3 0.4 0.5 0.6\n1 0.4 0.4 0.1 0.1\n"
        self.assertEqual(count_valid_remapped_rows(text), (1, 1))

    def test_write_dataset_yaml_uses_canonical_classes(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "dataset.yaml"
            write_dataset_yaml(output)
            content = output.read_text(encoding="utf-8")
        self.assertIn("2: banana", content)
        self.assertIn("3: banana_spot", content)
        self.assertIn("5: orange_spot", content)


if __name__ == "__main__":
    unittest.main()
