from __future__ import annotations

import shlex
from pathlib import Path
from typing import Any

from advance_seeds_ml.dataset import _read_yaml_mapping


BOOL_KEYS = {
    "amp",
    "cache",
    "cos_lr",
    "deterministic",
    "plots",
    "pretrained",
    "save",
    "val",
}

INT_KEYS = {
    "close_mosaic",
    "epochs",
    "imgsz",
    "patience",
    "save_period",
    "seed",
    "workers",
}

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

TRAIN_KEYS = BOOL_KEYS | INT_KEYS | FLOAT_KEYS | {
    "data",
    "device",
    "model",
    "name",
    "optimizer",
    "project",
}


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
    if key in BOOL_KEYS:
        if isinstance(value, bool):
            return value
        if str(value).lower() in {"true", "1", "yes"}:
            return True
        if str(value).lower() in {"false", "0", "no"}:
            return False
        raise ValueError(f"{key} must be boolean")
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


def train_kwargs(config: dict[str, Any]) -> dict[str, Any]:
    kwargs = dict(config)
    kwargs.pop("model", None)
    return kwargs


def cli_preview(config: dict[str, Any]) -> str:
    parts = ["yolo", "segment", "train"]
    for key, value in config.items():
        parts.append(f"{key}={format_cli_value(value)}")
    return " ".join(shlex.quote(part) for part in parts)


def format_cli_value(value: Any) -> str:
    if isinstance(value, bool):
        return "True" if value else "False"
    return str(value)
