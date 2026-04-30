#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from advance_seeds_ml.dataset import validate_yolo_seg_dataset


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate a YOLO segmentation dataset config.")
    parser.add_argument("config", help="Path to dataset YAML")
    args = parser.parse_args()

    report = validate_yolo_seg_dataset(args.config)
    print(f"root: {report.root}")
    print(f"classes: {report.class_names}")
    for split in ("train", "val", "test"):
        print(
            f"{split}: {report.split_images.get(split, 0)} images, "
            f"{report.split_labels.get(split, 0)} label files"
        )
    print(f"class_counts: {report.class_counts}")
    if report.issues:
        print("issues:")
        for issue in report.issues:
            print(f"  {issue.path}:{issue.line_number}: {issue.message}")
        return 1
    print("ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
