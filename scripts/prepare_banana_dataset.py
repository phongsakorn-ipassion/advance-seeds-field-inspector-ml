#!/usr/bin/env python3
from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from advance_seeds_ml.banana_dataset import BANANA_V4_CLASS_NAMES, count_valid_remapped_rows, remap_label_text, write_dataset_yaml

DEFAULT_SOURCE = Path("/Users/ppungpong/Downloads/Advance Seeds.v6-banana-v4.yolo26")
DEFAULT_DESTINATION = Path("data/processed/advance-seeds-dataset-v4")
DEFAULT_CONFIG = Path("configs/dataset.v4.yaml")

SPLIT_MAP = {
    "train": "train",
    "valid": "val",
    "test": "test",
}


def copy_split(
    source_root: Path,
    destination_root: Path,
    source_split: str,
    target_split: str,
    remap_classes: bool,
) -> tuple[int, int, int]:
    source_images = source_root / source_split / "images"
    source_labels = source_root / source_split / "labels"
    if not source_images.exists():
        raise FileNotFoundError(source_images)
    if not source_labels.exists():
        raise FileNotFoundError(source_labels)

    destination_images = destination_root / "images" / target_split
    destination_labels = destination_root / "labels" / target_split
    destination_images.mkdir(parents=True, exist_ok=True)
    destination_labels.mkdir(parents=True, exist_ok=True)

    image_count = 0
    for image_path in sorted(source_images.iterdir()):
        if image_path.is_file():
            shutil.copy2(image_path, destination_images / image_path.name)
            image_count += 1

    label_count = 0
    skipped_rows = 0
    for label_path in sorted(source_labels.glob("*.txt")):
        source_text = label_path.read_text(encoding="utf-8")
        if remap_classes:
            _, skipped = count_valid_remapped_rows(source_text)
            output_text = remap_label_text(source_text, skip_invalid=True)
        else:
            skipped = 0
            output_text = source_text
        (destination_labels / label_path.name).write_text(output_text, encoding="utf-8")
        label_count += 1
        skipped_rows += skipped

    return image_count, label_count, skipped_rows


def prepare_dataset(
    source: Path,
    destination: Path,
    config: Path,
    overwrite: bool,
    remap_classes: bool,
) -> dict[str, tuple[int, int, int]]:
    if not source.exists():
        raise FileNotFoundError(source)
    if destination.exists():
        if not overwrite:
            raise FileExistsError(f"{destination} already exists; pass --overwrite to replace it")
        shutil.rmtree(destination)

    summary: dict[str, tuple[int, int, int]] = {}
    for source_split, target_split in SPLIT_MAP.items():
        summary[target_split] = copy_split(source, destination, source_split, target_split, remap_classes)

    dataset_root = Path("..") / destination
    write_dataset_yaml(config, dataset_root=str(dataset_root), class_names=BANANA_V4_CLASS_NAMES)
    return summary


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Prepare the active Roboflow banana-v4 dataset."
    )
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--destination", type=Path, default=DEFAULT_DESTINATION)
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument(
        "--remap-classes",
        action="store_true",
        help="Remap source class ids 0/1 to canonical six-class ids 2/3 for legacy datasets.",
    )
    parser.add_argument("--overwrite", action="store_true")
    args = parser.parse_args()

    summary = prepare_dataset(
        source=args.source,
        destination=args.destination,
        config=args.config,
        overwrite=args.overwrite,
        remap_classes=args.remap_classes,
    )
    print(f"destination: {args.destination}")
    print(f"config: {args.config}")
    for split, (images, labels, skipped_rows) in summary.items():
        print(f"{split}: {images} images, {labels} labels, {skipped_rows} skipped invalid rows")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
