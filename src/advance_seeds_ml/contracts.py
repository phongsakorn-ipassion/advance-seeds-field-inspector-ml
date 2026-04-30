from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Literal


OutputKind = Literal["raw", "nms", "end2end_nms_free", "segmentation"]


@dataclass(frozen=True)
class CalibrationContract:
    required: bool = True
    supported_sources: list[str] = field(default_factory=lambda: ["aruco", "lidar", "manual"])
    default_marker_mm: float = 50.0


@dataclass(frozen=True)
class AcceptanceTargets:
    segmentation_map: float = 0.85
    mask_map: float = 0.80
    measurement_error_mm: float = 0.5


@dataclass(frozen=True)
class ModelMetadata:
    model_name: str
    model_version: str
    task: str
    input_size: int
    class_names: list[str]
    output_kind: OutputKind
    output_shape: list[int]
    score_threshold: float
    iou_threshold: float
    source_weights: str = "yolo26n-seg.pt"
    mobile_tflite_filename: str = "yolo11n-seeds.tflite"
    calibration: CalibrationContract = field(default_factory=CalibrationContract)
    acceptance_targets: AcceptanceTargets = field(default_factory=AcceptanceTargets)

    def validate(self) -> None:
        if not self.model_name.strip():
            raise ValueError("model_name is required")
        if not self.model_version.strip():
            raise ValueError("model_version is required")
        if self.task not in {"instance-segmentation", "detection"}:
            raise ValueError("task must be instance-segmentation or detection")
        if self.input_size <= 0:
            raise ValueError("input_size must be > 0")
        if not self.class_names:
            raise ValueError("class_names must not be empty")
        if any(not name.strip() for name in self.class_names):
            raise ValueError("class_names must not contain blank names")
        if not self.source_weights.strip():
            raise ValueError("source_weights is required")
        if not self.mobile_tflite_filename.strip():
            raise ValueError("mobile_tflite_filename is required")
        if not self.output_shape or any(dim <= 0 for dim in self.output_shape):
            raise ValueError("output_shape dimensions must be > 0")
        if not 0 <= self.score_threshold <= 1:
            raise ValueError("score_threshold must be between 0 and 1")
        if not 0 <= self.iou_threshold <= 1:
            raise ValueError("iou_threshold must be between 0 and 1")
        if self.calibration.default_marker_mm <= 0:
            raise ValueError("default_marker_mm must be > 0")

    def to_dict(self) -> dict[str, Any]:
        self.validate()
        return asdict(self)


def write_metadata(metadata: ModelMetadata, output_path: str | Path) -> Path:
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(metadata.to_dict(), indent=2) + "\n", encoding="utf-8")
    return output


def load_metadata(path: str | Path) -> ModelMetadata:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    calibration = CalibrationContract(**data.pop("calibration", {}))
    acceptance_targets = AcceptanceTargets(**data.pop("acceptance_targets", {}))
    metadata = ModelMetadata(
        **data,
        calibration=calibration,
        acceptance_targets=acceptance_targets,
    )
    metadata.validate()
    return metadata
