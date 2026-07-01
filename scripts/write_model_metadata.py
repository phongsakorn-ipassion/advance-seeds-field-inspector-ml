#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from advance_seeds_ml.contracts import (
    MASK_PROTO_SHAPE,
    ModelMetadata,
    load_class_names,
    raw_seg_output_shape,
    write_metadata,
)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Write app-facing model metadata JSON.")
    parser.add_argument("--model-name", required=True)
    parser.add_argument("--model-version", required=True)
    parser.add_argument("--task", default="instance-segmentation")
    parser.add_argument("--input-size", type=int, default=640)
    parser.add_argument("--source-weights", default="yolo26n-seg.pt")
    parser.add_argument("--mobile-tflite-filename", default="yolo11n-seeds.tflite")
    # Class names come from exactly one source: an explicit list, or a dataset
    # config YAML's `names:` block (the same source Ultralytics trains from).
    classes_group = parser.add_mutually_exclusive_group(required=True)
    classes_group.add_argument("--classes", nargs="+")
    classes_group.add_argument(
        "--dataset-config",
        help="Dataset config YAML; class_names are derived from its 'names:' block.",
    )
    parser.add_argument(
        "--output-kind",
        choices=["raw", "nms", "end2end_nms_free", "segmentation", "segmentation_raw"],
        default="segmentation_raw",
    )
    # Default derived from the class count for raw seg ([1, 4+nc+32, anchors]).
    parser.add_argument("--output-shape", nargs="+", type=int, default=None)
    parser.add_argument(
        "--nms-applied",
        action=argparse.BooleanOptionalAction,
        default=None,
        help="Whether NMS is baked into the graph. Defaults False for segmentation_raw.",
    )
    parser.add_argument("--mask-proto-shape", nargs="+", type=int, default=None)
    parser.add_argument("--score-threshold", type=float, default=0.35)
    parser.add_argument("--iou-threshold", type=float, default=0.6)
    parser.add_argument("--output", default="models/model-metadata.json")
    args = parser.parse_args(argv)

    class_names = args.classes if args.classes else load_class_names(args.dataset_config)

    is_raw_seg = args.output_kind == "segmentation_raw"
    output_shape = args.output_shape
    if output_shape is None:
        output_shape = (
            raw_seg_output_shape(len(class_names), args.input_size)
            if is_raw_seg
            else [1, 300, 38]
        )
    nms_applied = args.nms_applied if args.nms_applied is not None else (not is_raw_seg)
    mask_proto_shape = args.mask_proto_shape
    if mask_proto_shape is None and is_raw_seg:
        mask_proto_shape = list(MASK_PROTO_SHAPE)

    metadata = ModelMetadata(
        model_name=args.model_name,
        model_version=args.model_version,
        task=args.task,
        input_size=args.input_size,
        source_weights=args.source_weights,
        mobile_tflite_filename=args.mobile_tflite_filename,
        class_names=class_names,
        output_kind=args.output_kind,
        output_shape=output_shape,
        nms_applied=nms_applied,
        mask_proto_shape=mask_proto_shape,
        score_threshold=args.score_threshold,
        iou_threshold=args.iou_threshold,
    )
    output = write_metadata(metadata, args.output)
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
