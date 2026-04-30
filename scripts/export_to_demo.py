#!/usr/bin/env python3
from __future__ import annotations

import argparse
import shutil
from pathlib import Path


DEFAULT_DEMO_MODELS = Path(
    "/Users/ppungpong/Github/advance-seeds-field-inspector-demo/apps/mobile/assets/models"
)


def copy_if_present(source: Path | None, destination: Path) -> Path | None:
    if source is None:
        return None
    if not source.exists():
        raise FileNotFoundError(source)
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)
    return destination


def main() -> int:
    parser = argparse.ArgumentParser(description="Copy exported model artifacts into the demo app.")
    parser.add_argument("--tflite", type=Path, help="Path to exported TFLite model")
    parser.add_argument("--metadata", type=Path, help="Path to model-metadata.json")
    parser.add_argument("--demo-models-dir", type=Path, default=DEFAULT_DEMO_MODELS)
    args = parser.parse_args()

    copied: list[Path] = []
    tflite_dest = copy_if_present(args.tflite, args.demo_models_dir / "yolo11n-seeds.tflite")
    metadata_dest = copy_if_present(args.metadata, args.demo_models_dir / "model-metadata.json")
    if tflite_dest:
        copied.append(tflite_dest)
    if metadata_dest:
        copied.append(metadata_dest)
    if not copied:
        raise SystemExit("nothing to copy; pass --tflite and/or --metadata")
    for path in copied:
        print(path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
