from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class MeasurementError:
    expected_mm: float
    measured_mm: float

    @property
    def absolute_mm(self) -> float:
        return abs(self.measured_mm - self.expected_mm)

    @property
    def percent(self) -> float:
        if self.expected_mm == 0:
            return 0.0 if self.measured_mm == 0 else float("inf")
        return (self.absolute_mm / self.expected_mm) * 100.0


def px_per_mm(marker_size_px: float, marker_size_mm: float) -> float:
    if marker_size_px <= 0:
        raise ValueError("marker_size_px must be > 0")
    if marker_size_mm <= 0:
        raise ValueError("marker_size_mm must be > 0")
    return marker_size_px / marker_size_mm


def pixels_to_mm(pixel_length: float, px_per_mm_value: float) -> float:
    if pixel_length < 0:
        raise ValueError("pixel_length must be >= 0")
    if px_per_mm_value <= 0:
        raise ValueError("px_per_mm_value must be > 0")
    return pixel_length / px_per_mm_value


def measurement_error(expected_mm: float, measured_mm: float) -> MeasurementError:
    if expected_mm < 0:
        raise ValueError("expected_mm must be >= 0")
    if measured_mm < 0:
        raise ValueError("measured_mm must be >= 0")
    return MeasurementError(expected_mm=expected_mm, measured_mm=measured_mm)
