#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from advance_seeds_ml.contracts import ModelMetadata, write_metadata
from advance_seeds_ml.training import materialize_ultralytics_dataset_config


# Fallback only — the real class list is derived from the trained model's
# `model.names` at export time (see resolve_class_names). Kept so a model that
# somehow ships without names still produces a valid (if generic) metadata file.
CLASS_NAMES = ["banana", "banana_spot"]


def resolve_class_names(
    names: dict[int, str] | list[str],
    fallback: list[str] | None = None,
) -> list[str]:
    """Turn a model's class map into the ordered list the metadata contract needs.

    Ultralytics exposes `model.names` as a {class_index: name} dict whose key
    order is not guaranteed. The exported `model-metadata.json` must list names
    in class-index order (index 0 first), because the app maps a detection's
    integer `class_id` straight into this array.

    Args:
        names: either a {index: name} dict (from `model.names`) or an already
            ordered list of names.
        fallback: class names to use when `names` is empty/missing.

    Returns:
        Class names ordered by class index.

    Raises:
        ValueError: when no names can be resolved (empty input and no fallback).
            An empty class list would fail ModelMetadata.validate() downstream.
    """
    ordered = list(names) if isinstance(names, list) else [names[i] for i in sorted(names)]
    if not ordered:
        ordered = list(fallback) if fallback else []
    if not ordered:
        raise ValueError("could not resolve any class names for model metadata")
    return ordered


@dataclass(frozen=True)
class ExportCandidate:
    key: str
    display_name: str
    weights: Path
    train_results: Path
    dataset_config: Path
    quantized: bool = False


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for block in iter(lambda: fh.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def sha256_path(path: Path) -> str:
    if path.is_file():
        return sha256_file(path)
    digest = hashlib.sha256()
    for child in sorted(item for item in path.rglob("*") if item.is_file()):
        digest.update(child.relative_to(path).as_posix().encode("utf-8"))
        digest.update(b"\0")
        with child.open("rb") as fh:
            for block in iter(lambda: fh.read(1024 * 1024), b""):
                digest.update(block)
        digest.update(b"\0")
    return digest.hexdigest()


def file_size(path: Path) -> int:
    if path.is_dir():
        return sum(child.stat().st_size for child in path.rglob("*") if child.is_file())
    return path.stat().st_size


def copy_artifact(source: Path, destination: Path) -> Path:
    if destination.exists():
        if destination.is_dir():
            shutil.rmtree(destination)
        else:
            destination.unlink()
    destination.parent.mkdir(parents=True, exist_ok=True)
    if source.is_dir():
        shutil.copytree(source, destination)
    else:
        shutil.copy2(source, destination)
    return destination


def export_model(
    candidate: ExportCandidate,
    output_root: Path,
    imgsz: int,
    max_det: int = 300,
    iou: float = 0.7,
    conf: float = 0.25,
) -> dict[str, Any]:
    from ultralytics import YOLO

    model = YOLO(str(candidate.weights))
    target_dir = output_root / candidate.key
    target_dir.mkdir(parents=True, exist_ok=True)

    artifacts: dict[str, dict[str, Any]] = {}
    pytorch_destination = target_dir / f"{candidate.key}.pt"
    if not pytorch_destination.exists():
        copy_artifact(candidate.weights, pytorch_destination)
    artifacts["pytorch"] = {
        "path": str(pytorch_destination),
        "sha256": sha256_path(pytorch_destination),
        "size_bytes": file_size(pytorch_destination),
        "quantization": "none",
        "precision": "fp32",
    }
    materialize_ultralytics_dataset_config(
        {"data": str(candidate.dataset_config)},
        output_root / "_runtime_datasets",
    )
    for fmt, suffix in (("tflite", ".tflite"), ("coreml", ".mlpackage")):
        destination = target_dir / f"{candidate.key}{suffix}"
        if destination.exists():
            artifacts[fmt] = {
                "path": str(destination),
                "sha256": sha256_path(destination),
                "size_bytes": file_size(destination),
            }
            continue
        # end2end=False selects YOLO26's one-to-many head so nms=True actually
        # applies and the exported graph is the classic seg head onnx2tf can
        # convert to TFLite. The default one-to-one (end2end) head bakes NMS in
        # and breaks the ONNX->TF hop. See drift-register D-TFLITE-ONNX2TF.
        common_nms: dict[str, Any] = {"end2end": False, "nms": True, "max_det": max_det, "iou": iou, "conf": conf}
        export_args: dict[str, Any] = {
            "imgsz": imgsz,
            "optimize": False,
            **common_nms,
        }
        if fmt == "tflite" and candidate.quantized:
            export_args["half"] = True
        if fmt == "coreml" and candidate.quantized:
            export_args["half"] = True
        if fmt == "tflite":
            # ONNX->TF (onnx2tf) is a CPU-friendly graph rewrite; force it onto
            # CPU so it can't hit missing CUDA kernels on newer GPUs (Blackwell
            # cc 12.0 -> CUDA_ERROR_INVALID_HANDLE). See drift D-TFLITE-ONNX2TF.
            prior_cuda = os.environ.get("CUDA_VISIBLE_DEVICES")
            os.environ["CUDA_VISIBLE_DEVICES"] = ""
            try:
                exported = Path(model.export(format=fmt, **export_args))
            finally:
                if prior_cuda is None:
                    os.environ.pop("CUDA_VISIBLE_DEVICES", None)
                else:
                    os.environ["CUDA_VISIBLE_DEVICES"] = prior_cuda
        else:
            exported = Path(model.export(format=fmt, **export_args))
        destination = copy_artifact(exported, destination)
        artifacts[fmt] = {
            "path": str(destination),
            "sha256": sha256_path(destination),
            "size_bytes": file_size(destination),
        }

    metadata_path = target_dir / "model-metadata.json"
    metadata = ModelMetadata(
        model_name="yolo26n-seg",
        model_version=candidate.key,
        task="instance-segmentation",
        input_size=imgsz,
        source_weights=str(candidate.weights),
        mobile_tflite_filename=f"{candidate.key}.tflite",
        class_names=resolve_class_names(model.names, fallback=CLASS_NAMES),
        output_kind="segmentation",
        output_shape=[1, 300, 38],
        score_threshold=0.35,
        iou_threshold=0.6,
    )
    write_metadata(metadata, metadata_path)

    manifest = {
        "key": candidate.key,
        "display_name": candidate.display_name,
        "quantized": candidate.quantized,
        "quantization": "fp16" if candidate.quantized else "none",
        "weights": str(candidate.weights),
        "train_results": str(candidate.train_results),
        "dataset_config": str(candidate.dataset_config),
        "metadata": str(metadata_path),
        "artifacts": artifacts,
    }
    manifest_path = target_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


def write_index(output_root: Path, manifests: list[dict[str, Any]]) -> Path:
    output = output_root / "model-candidates.index.json"
    merged = {}
    for manifest_path in sorted(output_root.glob("*/manifest.json")):
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        merged[manifest["key"]] = manifest
    for manifest in manifests:
        merged[manifest["key"]] = manifest
    models = [merged[key] for key in sorted(merged)]
    output.write_text(json.dumps({"models": models}, indent=2) + "\n", encoding="utf-8")
    return output


def main() -> int:
    parser = argparse.ArgumentParser(description="Export mobile model candidates for app testing.")
    parser.add_argument("--output-root", type=Path, default=Path("runs/mobile-exports"))
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--only", nargs="*", choices=["v4", "v4-quantized"])
    parser.add_argument("--max-det", type=int, default=300, help="Ultralytics NMS max_det (1-300)")
    parser.add_argument("--iou", type=float, default=0.7, help="Ultralytics NMS IoU threshold (0-1)")
    parser.add_argument("--conf", type=float, default=0.25, help="Ultralytics NMS conf threshold (0-1)")
    args = parser.parse_args()

    if not (1 <= args.max_det <= 300):
        parser.error("--max-det must be in [1, 300]")
    if not (0.0 <= args.iou <= 1.0):
        parser.error("--iou must be in [0, 1]")
    if not (0.0 <= args.conf <= 1.0):
        parser.error("--conf must be in [0, 1]")

    candidates = [
        ExportCandidate(
            key="banana-v4",
            display_name="banana-v4 baseline",
            weights=Path("runs/banana-v4/banana-v4-baseline/weights/best.pt"),
            train_results=Path("runs/banana-v4/banana-v4-baseline/results.csv"),
            dataset_config=Path("configs/dataset.v4.yaml"),
        ),
        ExportCandidate(
            key="banana-v4-quantized",
            display_name="banana-v4 baseline quantized",
            weights=Path("runs/banana-v4/banana-v4-baseline/weights/best.pt"),
            train_results=Path("runs/banana-v4/banana-v4-baseline/results.csv"),
            dataset_config=Path("configs/dataset.v4.yaml"),
            quantized=True,
        ),
    ]
    selected_keys = {
        "v4": "banana-v4",
        "v4-quantized": "banana-v4-quantized",
    }
    if args.only:
        wanted = {selected_keys[key] for key in args.only}
        candidates = [candidate for candidate in candidates if candidate.key in wanted]
    manifests = []
    for candidate in candidates:
        print(f"Exporting {candidate.key}...")
        manifests.append(export_model(candidate, args.output_root, args.imgsz, max_det=args.max_det, iou=args.iou, conf=args.conf))
    print(write_index(args.output_root, manifests))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
