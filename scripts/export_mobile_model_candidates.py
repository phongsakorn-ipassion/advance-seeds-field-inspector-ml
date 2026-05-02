#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from advance_seeds_ml.contracts import ModelMetadata, write_metadata
from advance_seeds_ml.training import materialize_ultralytics_dataset_config


CLASS_NAMES = ["apple", "apple_spot", "banana", "banana_spot", "orange", "orange_spot"]


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


def export_model(candidate: ExportCandidate, output_root: Path, imgsz: int) -> dict[str, Any]:
    from ultralytics import YOLO

    model = YOLO(str(candidate.weights))
    target_dir = output_root / candidate.key
    target_dir.mkdir(parents=True, exist_ok=True)

    artifacts: dict[str, dict[str, Any]] = {}
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
        export_args: dict[str, Any] = {
            "imgsz": imgsz,
            "optimize": False,
        }
        if fmt == "tflite" and candidate.quantized:
            export_args["half"] = True
        if fmt == "coreml" and candidate.quantized:
            export_args["half"] = True
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
        class_names=CLASS_NAMES,
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
    parser.add_argument("--only", nargs="*", choices=["v1", "v1-quantized", "v2", "v2-quantized"])
    args = parser.parse_args()

    candidates = [
        ExportCandidate(
            key="1-v1",
            display_name="banana-v1 best",
            weights=Path("/Users/ppungpong/Github/advance-seeds-field-inspector-ml/runs/banana-v1/banana-v1-poc/weights/best.pt"),
            train_results=Path("/Users/ppungpong/Github/advance-seeds-field-inspector-ml/runs/banana-v1/banana-v1-poc/results.csv"),
            dataset_config=Path("/Users/ppungpong/Github/advance-seeds-field-inspector-ml/configs/dataset.banana-v1.yaml"),
        ),
        ExportCandidate(
            key="2-v1-quantized",
            display_name="banana-v1 best quantized",
            weights=Path("/Users/ppungpong/Github/advance-seeds-field-inspector-ml/runs/banana-v1/banana-v1-poc/weights/best.pt"),
            train_results=Path("/Users/ppungpong/Github/advance-seeds-field-inspector-ml/runs/banana-v1/banana-v1-poc/results.csv"),
            dataset_config=Path("/Users/ppungpong/Github/advance-seeds-field-inspector-ml/configs/dataset.banana-v1.yaml"),
            quantized=True,
        ),
        ExportCandidate(
            key="3-v2",
            display_name="banana-v2 best",
            weights=Path("runs/banana-v2/banana-v2-poc-full/weights/best.pt"),
            train_results=Path("runs/banana-v2/banana-v2-poc-full/results.csv"),
            dataset_config=Path("configs/dataset.banana-v2.yaml"),
        ),
        ExportCandidate(
            key="4-v2-quantized",
            display_name="banana-v2 best quantized",
            weights=Path("runs/banana-v2/banana-v2-poc-full/weights/best.pt"),
            train_results=Path("runs/banana-v2/banana-v2-poc-full/results.csv"),
            dataset_config=Path("configs/dataset.banana-v2.yaml"),
            quantized=True,
        ),
    ]
    selected_keys = {
        "v1": "1-v1",
        "v1-quantized": "2-v1-quantized",
        "v2": "3-v2",
        "v2-quantized": "4-v2-quantized",
    }
    if args.only:
        wanted = {selected_keys[key] for key in args.only}
        candidates = [candidate for candidate in candidates if candidate.key in wanted]
    manifests = []
    for candidate in candidates:
        print(f"Exporting {candidate.key}...")
        manifests.append(export_model(candidate, args.output_root, args.imgsz))
    print(write_index(args.output_root, manifests))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
