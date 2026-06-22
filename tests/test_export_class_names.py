import importlib.util
import sys
import unittest
from pathlib import Path

# Load scripts/export_mobile_model_candidates.py as a module without importing
# ultralytics (the heavy `from ultralytics import YOLO` lives inside a function,
# so module import stays cheap).
_SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "export_mobile_model_candidates.py"
_spec = importlib.util.spec_from_file_location("export_mobile_model_candidates", _SCRIPT)
export_mod = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = export_mod
_spec.loader.exec_module(export_mod)

resolve_class_names = export_mod.resolve_class_names


class ResolveClassNamesTests(unittest.TestCase):
    def test_orders_dict_by_class_index(self):
        # Ultralytics exposes model.names as a {index: name} dict; key order is
        # not guaranteed, but the exported metadata must be index-ordered.
        names = {2: "pepper", 0: "banana", 3: "watermelon", 1: "banana_spot"}
        self.assertEqual(
            resolve_class_names(names),
            ["banana", "banana_spot", "pepper", "watermelon"],
        )

    def test_passes_through_list(self):
        self.assertEqual(
            resolve_class_names(["banana", "banana_spot"]),
            ["banana", "banana_spot"],
        )

    def test_empty_uses_fallback(self):
        self.assertEqual(
            resolve_class_names({}, fallback=["banana"]),
            ["banana"],
        )

    def test_empty_without_fallback_raises(self):
        with self.assertRaises(ValueError):
            resolve_class_names({})


if __name__ == "__main__":
    unittest.main()
