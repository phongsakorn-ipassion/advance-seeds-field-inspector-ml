#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from advance_seeds_ml.contracts import ModelMetadata, write_metadata


def main() -> int:
    parser = argparse.ArgumentParser(description="Write app-facing model metadata JSON.")
    parser.add_argument("--model-name", required=True)
    parser.add_argument("--model-version", required=True)
    parser.add_argument("--task", default="instance-segmentation")
    parser.add_argument("--input-size", type=int, default=640)
    parser.add_argument("--source-weights", default="yolo26n-seg.pt")
    parser.add_argument("--mobile-tflite-filename", default="yolo11n-seeds.tflite")
    parser.add_argument("--classes", nargs="+", required=True)
    parser.add_argument(
        "--output-kind",
        choices=["raw", "nms", "end2end_nms_free", "segmentation"],
        default="end2end_nms_free",
    )
    parser.add_argument("--output-shape", nargs="+", type=int, default=[1, 300, 6])
    parser.add_argument("--score-threshold", type=float, default=0.5)
    parser.add_argument("--iou-threshold", type=float, default=0.75)
    parser.add_argument("--output", default="models/model-metadata.json")
    args = parser.parse_args()

    metadata = ModelMetadata(
        model_name=args.model_name,
        model_version=args.model_version,
        task=args.task,
        input_size=args.input_size,
        source_weights=args.source_weights,
        mobile_tflite_filename=args.mobile_tflite_filename,
        class_names=args.classes,
        output_kind=args.output_kind,
        output_shape=args.output_shape,
        score_threshold=args.score_threshold,
        iou_threshold=args.iou_threshold,
    )
    output = write_metadata(metadata, args.output)
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
