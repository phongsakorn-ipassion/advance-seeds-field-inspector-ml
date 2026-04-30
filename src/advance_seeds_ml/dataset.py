from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class LabelIssue:
    path: Path
    line_number: int
    message: str


@dataclass
class DatasetReport:
    root: Path
    class_names: dict[int, str]
    split_images: dict[str, int] = field(default_factory=dict)
    split_labels: dict[str, int] = field(default_factory=dict)
    class_counts: dict[int, int] = field(default_factory=dict)
    issues: list[LabelIssue] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.issues


def load_dataset_config(path: str | Path) -> dict[str, Any]:
    config_path = Path(path)
    config = _read_yaml_mapping(config_path)
    if "path" not in config:
        raise ValueError("dataset config requires 'path'")
    if "names" not in config or not config["names"]:
        raise ValueError("dataset config requires non-empty 'names'")
    return config


def _read_yaml_mapping(path: Path) -> dict[str, Any]:
    try:
        import yaml  # type: ignore

        with path.open("r", encoding="utf-8") as fh:
            return yaml.safe_load(fh) or {}
    except ModuleNotFoundError:
        return _read_simple_yaml_mapping(path)


def _read_simple_yaml_mapping(path: Path) -> dict[str, Any]:
    """Tiny YAML subset reader for the checked-in dataset config shape.

    PyYAML is still the supported parser once the package is installed. This
    fallback keeps repo smoke tests usable on a clean machine.
    """
    result: dict[str, Any] = {}
    current_map_key: str | None = None
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.split("#", 1)[0].rstrip()
        if not line:
            continue
        if line.startswith("  ") and current_map_key:
            key, value = _split_key_value(line.strip())
            result[current_map_key][_coerce_scalar(key)] = _coerce_scalar(value)
            continue
        key, value = _split_key_value(line)
        if value == "":
            result[key] = {}
            current_map_key = key
        else:
            result[key] = _coerce_scalar(value)
            current_map_key = None
    return result


def _split_key_value(line: str) -> tuple[str, str]:
    if ":" not in line:
        raise ValueError(f"invalid YAML line: {line}")
    key, value = line.split(":", 1)
    return key.strip(), value.strip()


def _coerce_scalar(value: str) -> Any:
    if value == "":
        return value
    if value.lower() in {"true", "false"}:
        return value.lower() == "true"
    try:
        if "." in value:
            return float(value)
        return int(value)
    except ValueError:
        return value.strip('"').strip("'")


def validate_yolo_seg_dataset(config_path: str | Path) -> DatasetReport:
    config = load_dataset_config(config_path)
    config_dir = Path(config_path).resolve().parent
    root = _resolve_path(config_dir, config["path"])
    class_names = _normalize_names(config["names"])
    report = DatasetReport(root=root, class_names=class_names)

    for split in ("train", "val", "test"):
        image_dir = root / str(config.get(split, f"images/{split}"))
        label_dir = _label_dir_for(root, image_dir)
        images = _list_images(image_dir)
        labels = sorted(label_dir.glob("*.txt")) if label_dir.exists() else []
        report.split_images[split] = len(images)
        report.split_labels[split] = len(labels)
        if images and not label_dir.exists():
            report.issues.append(LabelIssue(label_dir, 0, "label directory is missing"))
        _validate_split_labels(labels, class_names, report)

    return report


def _resolve_path(base: Path, value: str) -> Path:
    path = Path(value)
    if path.is_absolute():
        return path
    return (base / path).resolve()


def _normalize_names(names: Any) -> dict[int, str]:
    if isinstance(names, list):
        return {i: str(name) for i, name in enumerate(names)}
    if isinstance(names, dict):
        return {int(k): str(v) for k, v in names.items()}
    raise ValueError("names must be a list or dict")


def _label_dir_for(root: Path, image_dir: Path) -> Path:
    try:
        rel = image_dir.relative_to(root)
    except ValueError:
        return image_dir.parent.parent / "labels" / image_dir.name
    parts = list(rel.parts)
    if parts and parts[0] == "images":
        parts[0] = "labels"
        return root.joinpath(*parts)
    return root / "labels" / image_dir.name


def _list_images(image_dir: Path) -> list[Path]:
    if not image_dir.exists():
        return []
    exts = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
    return sorted(path for path in image_dir.iterdir() if path.suffix.lower() in exts)


def _validate_split_labels(
    label_paths: list[Path],
    class_names: dict[int, str],
    report: DatasetReport,
) -> None:
    for label_path in label_paths:
        for line_number, raw_line in enumerate(label_path.read_text(encoding="utf-8").splitlines(), 1):
            line = raw_line.strip()
            if not line:
                continue
            issue = validate_yolo_seg_line(line, class_names)
            if issue:
                report.issues.append(LabelIssue(label_path, line_number, issue))
                continue
            class_id = int(line.split()[0])
            report.class_counts[class_id] = report.class_counts.get(class_id, 0) + 1


def validate_yolo_seg_line(line: str, class_names: dict[int, str]) -> str | None:
    parts = line.split()
    if len(parts) < 7:
        return "segmentation row needs class id plus at least 3 polygon points"
    if (len(parts) - 1) % 2 != 0:
        return "polygon coordinate count must be even"
    try:
        class_id = int(parts[0])
    except ValueError:
        return "class id must be an integer"
    if class_id not in class_names:
        return f"class id {class_id} is not defined in dataset names"
    for value in parts[1:]:
        try:
            coord = float(value)
        except ValueError:
            return f"coordinate {value!r} is not numeric"
        if coord < 0 or coord > 1:
            return f"coordinate {coord} is outside normalized range [0, 1]"
    return None
