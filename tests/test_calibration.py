import math
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from advance_seeds_ml.calibration import measurement_error, pixels_to_mm, px_per_mm


class CalibrationTests(unittest.TestCase):
    def test_px_per_mm_from_known_marker(self):
        self.assertEqual(px_per_mm(marker_size_px=250, marker_size_mm=50), 5)

    def test_pixels_to_mm_uses_calibration_scale(self):
        self.assertEqual(pixels_to_mm(pixel_length=125, px_per_mm_value=5), 25)

    def test_measurement_error_reports_absolute_and_percent(self):
        error = measurement_error(expected_mm=10, measured_mm=10.4)
        self.assertAlmostEqual(error.absolute_mm, 0.4)
        self.assertAlmostEqual(error.percent, 4.0)

    def test_zero_expected_percent_handles_zero_and_nonzero(self):
        self.assertEqual(measurement_error(0, 0).percent, 0)
        self.assertTrue(math.isinf(measurement_error(0, 1).percent))


if __name__ == "__main__":
    unittest.main()
