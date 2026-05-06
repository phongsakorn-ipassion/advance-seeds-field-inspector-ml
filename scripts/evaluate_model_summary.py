#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Evaluate a YOLO segmentation model and write a compact comparison summary."
    )
    parser.add_argument("--weights", required=True, help="PyTorch .pt weights to evaluate.")
    parser.add_argument("--data", required=True, help="Dataset YAML used for validation.")
    parser.add_argument("--output", required=True, help="JSON summary output path.")
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--split", default="test", choices=("train", "val", "test"))
    parser.add_argument("--samples", type=int, default=12, help="Number of fixed sample images to render predictions for.")
    parser.add_argument("--export", action="append", default=[], help="Optional exported artifact to evaluate for parity.")
    args = parser.parse_args()

    try:
        from ultralytics import YOLO
    except ModuleNotFoundError as exc:
        raise SystemExit("ultralytics is not installed. Run: python3 -m pip install -e '.[train]'") from exc

    data_path = Path(args.data).expanduser().resolve()
    output_path = Path(args.output).expanduser().resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    sample_images = fixed_sample_images(data_path, args.split, args.samples)

    base_model = YOLO(str(Path(args.weights).expanduser()))
    pytorch_metrics = evaluate(base_model, str(data_path), args.imgsz, args.split)
    predictions_dir = output_path.parent / "sample_predictions"
    if sample_images:
        base_model.predict(
            source=[str(path) for path in sample_images],
            imgsz=args.imgsz,
            save=True,
            project=str(predictions_dir),
            name="pytorch",
            exist_ok=True,
        )

    exports: list[dict[str, Any]] = []
    for export in args.export:
        export_path = Path(export).expanduser()
        export_model = YOLO(str(export_path))
        metrics = evaluate(export_model, str(data_path), args.imgsz, args.split)
        exports.append(
            {
                "artifact": str(export_path),
                "metrics": metrics,
                "parity_delta": metric_delta(pytorch_metrics, metrics),
            }
        )

    summary = {
        "weights": str(Path(args.weights).expanduser()),
        "data": str(data_path),
        "split": args.split,
        "imgsz": args.imgsz,
        "sample_images": [str(path) for path in sample_images],
        "sample_predictions_dir": str(predictions_dir / "pytorch") if sample_images else None,
        "pytorch": {"metrics": pytorch_metrics},
        "exports": exports,
        "acceptance_notes": [
            "Compare mask_map, map50, and banana_spot recall before promotion.",
            "Inspect sample_predictions_dir for visual mask quality.",
            "Do not promote larger or higher-imgsz models until mobile latency is acceptable.",
        ],
    }
    output_path.write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(output_path)
    return 0


def evaluate(model: Any, data: str, imgsz: int, split: str) -> dict[str, float]:
    results = model.val(data=data, imgsz=imgsz, split=split, plots=True)
    raw = getattr(results, "results_dict", {}) or {}
    metrics: dict[str, float] = {}
    metric_keys = {
        "metrics/precision(B)": "precision_box",
        "metrics/recall(B)": "recall_box",
        "metrics/mAP50(B)": "map50_box",
        "metrics/mAP50-95(B)": "map_box",
        "metrics/precision(M)": "precision_mask",
        "metrics/recall(M)": "recall_mask",
        "metrics/mAP50(M)": "map50_mask",
        "metrics/mAP50-95(M)": "mask_map",
        "fitness": "fitness",
    }
    for source, target in metric_keys.items():
        value = raw.get(source)
        if isinstance(value, (int, float)):
            metrics[target] = float(value)
    per_class = getattr(results, "class_result", None)
    if callable(per_class):
        try:
            class_results = per_class(1)
            if class_results and len(class_results) >= 2:
                metrics["banana_spot_recall"] = float(class_results[1])
        except Exception:
            pass
    return metrics


def metric_delta(reference: dict[str, float], candidate: dict[str, float]) -> dict[str, float]:
    keys = sorted(set(reference) & set(candidate))
    return {key: candidate[key] - reference[key] for key in keys}


def fixed_sample_images(data_path: Path, split: str, limit: int) -> list[Path]:
    dataset = read_yaml(data_path)
    root = Path(str(dataset["path"])).expanduser()
    if not root.is_absolute():
        root = (data_path.parent / root).resolve()
    image_dir = root / str(dataset.get(split, f"images/{split}"))
    if not image_dir.exists() and split == "test":
        image_dir = root / str(dataset.get("val", "images/val"))
    exts = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
    return sorted(path for path in image_dir.iterdir() if path.suffix.lower() in exts)[:limit]


def read_yaml(path: Path) -> dict[str, Any]:
    try:
        import yaml

        return yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    except ModuleNotFoundError:
        from advance_seeds_ml.dataset import _read_yaml_mapping

        return _read_yaml_mapping(path)


if __name__ == "__main__":
    raise SystemExit(main())
