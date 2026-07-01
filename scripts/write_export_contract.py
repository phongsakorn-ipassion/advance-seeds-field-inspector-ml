#!/usr/bin/env python3
"""Regenerate configs/model_export_contract.json from a dataset config YAML.

The frozen contract's `class_names` and raw-segmentation `output_shape` are the
only fields that depend on the trained class set. This tool derives both from a
dataset config's `names:` block (the single source of truth Ultralytics trains
from) and preserves every other frozen field from a base contract — thresholds,
calibration, acceptance targets, and the `yolo11n-seeds.tflite` app alias.

Shipping a class set wider than the demo app currently handles stays gated on a
lockstep app change; see the release-v10-multiclass-export-contract change.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from advance_seeds_ml.contracts import load_class_names, raw_seg_output_shape

DEFAULT_CONTRACT = "configs/model_export_contract.json"


def build_contract(base: dict, class_names: list[str]) -> dict:
    contract = dict(base)
    contract["class_names"] = class_names
    # Only the raw one-to-many seg head has a class-count-dependent shape.
    if contract.get("output_kind") == "segmentation_raw":
        contract["output_shape"] = raw_seg_output_shape(
            len(class_names), int(contract.get("input_size", 640))
        )
    return contract


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dataset-config",
        required=True,
        help="Dataset config YAML; class_names + output_shape are derived from its 'names:'.",
    )
    parser.add_argument(
        "--base",
        default=DEFAULT_CONTRACT,
        help="Existing contract to preserve frozen fields from (default: %(default)s).",
    )
    parser.add_argument(
        "--output",
        default=DEFAULT_CONTRACT,
        help="Where to write the regenerated contract (default: %(default)s).",
    )
    args = parser.parse_args(argv)

    base = json.loads(Path(args.base).read_text(encoding="utf-8"))
    class_names = load_class_names(args.dataset_config)
    contract = build_contract(base, class_names)

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(contract, indent=2) + "\n", encoding="utf-8")
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
