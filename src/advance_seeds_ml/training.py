from __future__ import annotations

import os
import platform
import shlex
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from advance_seeds_ml.dataset import _read_yaml_mapping


BOOL_KEYS = {
    "amp",
    "cos_lr",
    "deterministic",
    "plots",
    "pretrained",
    "save",
    "val",
}

BOOL_OR_AUTO_KEYS = {"amp", "cache"}

INT_KEYS = {
    "close_mosaic",
    "epochs",
    "imgsz",
    "patience",
    "save_period",
    "seed",
    "workers",
}

AUTO_INT_KEYS = {"batch", "workers"}

FLOAT_KEYS = {
    "batch",
    "copy_paste",
    "degrees",
    "fliplr",
    "flipud",
    "hsv_h",
    "hsv_s",
    "hsv_v",
    "lr0",
    "lrf",
    "mixup",
    "momentum",
    "mosaic",
    "scale",
    "shear",
    "translate",
    "warmup_epochs",
    "weight_decay",
}

TRAIN_KEYS = BOOL_KEYS | BOOL_OR_AUTO_KEYS | INT_KEYS | FLOAT_KEYS | {
    "data",
    "device",
    "model",
    "name",
    "optimizer",
    "project",
}


@dataclass(frozen=True)
class HardwareProfile:
    kind: str
    device: str
    cpu_count: int
    memory_gb: float | None = None
    gpu_name: str | None = None
    gpu_memory_gb: float | None = None


def load_training_config(path: str | Path) -> dict[str, Any]:
    config = _read_yaml_mapping(Path(path))
    unknown = sorted(set(config) - TRAIN_KEYS)
    if unknown:
        raise ValueError(f"unknown training config keys: {', '.join(unknown)}")
    for required in ("model", "data", "project", "name"):
        if required not in config or str(config[required]).strip() == "":
            raise ValueError(f"training config requires {required!r}")
    return {key: coerce_training_value(key, value) for key, value in config.items()}


def coerce_training_value(key: str, value: Any) -> Any:
    if key in BOOL_OR_AUTO_KEYS and str(value).lower() == "auto":
        return "auto"
    if key in BOOL_KEYS or key in BOOL_OR_AUTO_KEYS:
        if isinstance(value, bool):
            return value
        if str(value).lower() in {"true", "1", "yes"}:
            return True
        if str(value).lower() in {"false", "0", "no"}:
            return False
        raise ValueError(f"{key} must be boolean")
    if key in AUTO_INT_KEYS and str(value).lower() == "auto":
        return "auto"
    if key in INT_KEYS:
        return int(value)
    if key in FLOAT_KEYS:
        parsed = float(value)
        if key == "batch" and parsed.is_integer():
            return int(parsed)
        return parsed
    return str(value)


def apply_overrides(config: dict[str, Any], overrides: dict[str, Any]) -> dict[str, Any]:
    merged = dict(config)
    for key, value in overrides.items():
        if value is None:
            continue
        if key not in TRAIN_KEYS:
            raise ValueError(f"unknown override key: {key}")
        merged[key] = coerce_training_value(key, value)
    return merged


def resolve_training_paths(config: dict[str, Any], root: str | Path) -> dict[str, Any]:
    resolved = dict(config)
    root_path = Path(root).resolve()
    for key in ("data", "project"):
        value = resolved.get(key)
        if value is None:
            continue
        path = Path(str(value)).expanduser()
        if not path.is_absolute():
            path = root_path / path
        resolved[key] = str(path.resolve())
    return resolved


def materialize_ultralytics_dataset_config(config: dict[str, Any], runtime_dir: str | Path) -> dict[str, Any]:
    """Write a runtime dataset YAML with an absolute root for Ultralytics.

    Ultralytics resolves relative dataset `path:` values against its global
    datasets directory, not necessarily the dataset YAML location. Keeping the
    checked-in YAML repo-relative and materializing an ignored runtime copy
    makes local training independent from user-level Ultralytics settings.
    """
    resolved = dict(config)
    data_path = Path(str(resolved["data"])).expanduser().resolve()
    dataset = _read_yaml_mapping(data_path)
    dataset_root = Path(str(dataset["path"])).expanduser()
    if not dataset_root.is_absolute():
        dataset_root = (data_path.parent / dataset_root).resolve()
    dataset_root = _resolve_existing_dataset_root(dataset, dataset_root)
    dataset["path"] = str(dataset_root)

    output_dir = Path(runtime_dir).expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"{data_path.stem}.ultralytics.yaml"
    output_path.write_text(_dump_simple_yaml(dataset), encoding="utf-8")
    resolved["data"] = str(output_path)
    return resolved


def _resolve_existing_dataset_root(dataset: dict[str, Any], dataset_root: Path) -> Path:
    if _dataset_split_dirs_exist(dataset, dataset_root):
        return dataset_root

    tail = _dataset_root_tail(dataset_root)
    if tail is None:
        return dataset_root

    for anchor in dataset_root.parents:
        candidate = (anchor / tail).resolve()
        if candidate == dataset_root:
            continue
        if _dataset_split_dirs_exist(dataset, candidate):
            return candidate
    return dataset_root


def _dataset_root_tail(dataset_root: Path) -> Path | None:
    parts = dataset_root.parts
    if "data" not in parts:
        return None
    index = parts.index("data")
    return Path(*parts[index:])


def _dataset_split_dirs_exist(dataset: dict[str, Any], dataset_root: Path) -> bool:
    required = [dataset.get("train"), dataset.get("val") or dataset.get("validation")]
    split_dirs = [dataset_root / str(split) for split in required if split]
    return bool(split_dirs) and all(path.exists() for path in split_dirs)


def _dump_simple_yaml(mapping: dict[str, Any]) -> str:
    lines: list[str] = []
    for key, value in mapping.items():
        if isinstance(value, dict):
            lines.append(f"{key}:")
            for nested_key, nested_value in value.items():
                lines.append(f"  {nested_key}: {nested_value}")
            continue
        if isinstance(value, list):
            lines.append(f"{key}:")
            for index, item in enumerate(value):
                lines.append(f"  {index}: {item}")
            continue
        lines.append(f"{key}: {value}")
    return "\n".join(lines) + "\n"


def train_kwargs(config: dict[str, Any]) -> dict[str, Any]:
    kwargs = dict(config)
    kwargs.pop("model", None)
    kwargs.pop("hardware", None)
    return kwargs


def cli_preview(config: dict[str, Any]) -> str:
    parts = ["yolo", "segment", "train"]
    for key, value in config.items():
        if key == "hardware":
            continue
        parts.append(f"{key}={format_cli_value(value)}")
    return " ".join(shlex.quote(part) for part in parts)


def format_cli_value(value: Any) -> str:
    if isinstance(value, bool):
        return "True" if value else "False"
    return str(value)


def detect_hardware() -> HardwareProfile:
    cpu_count = os.cpu_count() or 1
    memory_gb = detect_memory_gb()
    if platform.system() == "Darwin":
        machine = platform.machine().lower()
        if machine in {"arm64", "aarch64"}:
            return HardwareProfile(kind="mps", device="mps", cpu_count=cpu_count, memory_gb=memory_gb)
        return HardwareProfile(kind="cpu", device="cpu", cpu_count=cpu_count, memory_gb=memory_gb)
    try:
        import torch
    except ModuleNotFoundError:
        return HardwareProfile(kind="cpu", device="cpu", cpu_count=cpu_count, memory_gb=memory_gb)

    if torch.cuda.is_available():
        device_index = 0
        props = torch.cuda.get_device_properties(device_index)
        return HardwareProfile(
            kind="cuda",
            device=str(device_index),
            cpu_count=cpu_count,
            memory_gb=memory_gb,
            gpu_name=props.name,
            gpu_memory_gb=round(props.total_memory / (1024**3), 2),
        )
    if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        return HardwareProfile(kind="mps", device="mps", cpu_count=cpu_count, memory_gb=memory_gb)
    return HardwareProfile(kind="cpu", device="cpu", cpu_count=cpu_count, memory_gb=memory_gb)


def detect_memory_gb() -> float | None:
    try:
        if platform.system() == "Darwin":
            import subprocess

            output = subprocess.check_output(["sysctl", "-n", "hw.memsize"], text=True).strip()
            return round(int(output) / (1024**3), 2)
        pages = os.sysconf("SC_PHYS_PAGES")
        page_size = os.sysconf("SC_PAGE_SIZE")
        return round((pages * page_size) / (1024**3), 2)
    except (AttributeError, OSError, ValueError):
        return None


def apply_hardware_profile(config: dict[str, Any], profile: HardwareProfile) -> dict[str, Any]:
    resolved = dict(config)
    if resolved.get("device") == "auto":
        resolved["device"] = profile.device
    if resolved.get("batch") == "auto":
        resolved["batch"] = recommended_batch(profile)
    if resolved.get("workers") == "auto":
        resolved["workers"] = recommended_workers(profile)
    if resolved.get("amp") == "auto":
        resolved["amp"] = profile.kind == "cuda"
    if resolved.get("cache") == "auto":
        resolved["cache"] = recommended_cache(profile)
    resolved["hardware"] = asdict(profile)
    return resolved


def recommended_batch(profile: HardwareProfile) -> int | float:
    if profile.kind == "cuda":
        return -1
    if profile.kind == "mps":
        if profile.memory_gb and profile.memory_gb >= 32:
            return 16
        return 8
    if profile.cpu_count >= 8 and profile.memory_gb and profile.memory_gb >= 16:
        return 8
    return 4


def recommended_workers(profile: HardwareProfile) -> int:
    if profile.kind == "cuda":
        return min(8, max(2, profile.cpu_count - 2))
    if profile.kind == "mps":
        return min(6, max(2, profile.cpu_count - 2))
    return min(4, max(1, profile.cpu_count // 2))


def recommended_cache(profile: HardwareProfile) -> bool | str:
    if profile.kind == "cuda" and profile.memory_gb and profile.memory_gb >= 24:
        return "ram"
    return False
