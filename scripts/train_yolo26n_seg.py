#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import platform
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from advance_seeds_ml.training import (
    apply_hardware_profile,
    apply_overrides,
    cli_preview,
    detect_hardware,
    load_training_config,
    materialize_ultralytics_dataset_config,
    resolve_training_paths,
    train_kwargs,
)
from advance_seeds_ml.registry import RegistryClient, RegistryConfig


def main(argv: list[str] | None = None, registry_client_factory=None, yolo_class=None) -> int:
    parser = argparse.ArgumentParser(description="Train YOLO26n-seg for the Advance Seeds PoC.")
    parser.add_argument("--config", default="configs/train.banana-v1.yaml")
    parser.add_argument("--dry-run", action="store_true", help="Print resolved config and command only.")
    parser.add_argument(
        "--no-auto-hardware",
        action="store_true",
        help="Do not resolve device/batch/workers/amp/cache from local hardware.",
    )
    parser.add_argument("--model")
    parser.add_argument("--data")
    parser.add_argument("--project")
    parser.add_argument("--name")
    parser.add_argument("--epochs", type=int)
    parser.add_argument("--patience", type=int)
    parser.add_argument("--imgsz", type=int)
    parser.add_argument("--batch")
    parser.add_argument("--device")
    parser.add_argument("--workers", type=int)
    parser.add_argument("--lr0", type=float)
    parser.add_argument("--lrf", type=float)
    parser.add_argument("--mosaic", type=float)
    parser.add_argument("--mixup", type=float)
    parser.add_argument("--copy-paste", dest="copy_paste", type=float)
    parser.add_argument(
        "--registry-report",
        action="store_true",
        help="Report this training run to the model registry backend.",
    )
    parser.add_argument(
        "--registry-model-line-id",
        help="Model registry model_lines.id for this run. Required with --registry-report.",
    )
    args = parser.parse_args(argv)

    config = load_training_config(args.config)
    config = apply_overrides(
        config,
        {
            "model": args.model,
            "data": args.data,
            "project": args.project,
            "name": args.name,
            "epochs": args.epochs,
            "patience": args.patience,
            "imgsz": args.imgsz,
            "batch": args.batch,
            "device": args.device,
            "workers": args.workers,
            "lr0": args.lr0,
            "lrf": args.lrf,
            "mosaic": args.mosaic,
            "mixup": args.mixup,
            "copy_paste": args.copy_paste,
        },
    )
    if not args.no_auto_hardware:
        config = apply_hardware_profile(config, detect_hardware())
    repo_root = Path(__file__).resolve().parents[1]
    config = resolve_training_paths(config, repo_root)
    config = materialize_ultralytics_dataset_config(config, repo_root / "runs" / "_runtime_datasets")

    print("Resolved training config:")
    print(json.dumps(config, indent=2))
    print("\nEquivalent CLI:")
    print(cli_preview(config))

    if args.dry_run:
        return 0

    if args.registry_report and not args.registry_model_line_id:
        parser.error("--registry-model-line-id is required with --registry-report")

    if yolo_class is None:
        try:
            from ultralytics import YOLO as yolo_class
        except ModuleNotFoundError as exc:
            raise SystemExit(
                "ultralytics is not installed. Run: python3 -m pip install -e '.[train]'"
            ) from exc

    registry = None
    run_id = None
    if args.registry_report:
        if registry_client_factory is None:
            registry_client_factory = lambda: RegistryClient(RegistryConfig.from_env())
        registry = registry_client_factory()
        run = registry.create_run(
            model_line_id=args.registry_model_line_id,
            config_yaml=config,
            git_sha=None,
            host=platform.node() or None,
            hardware=config.get("hardware") if isinstance(config.get("hardware"), dict) else None,
        )
        run_id = run["id"]

    try:
        model = yolo_class(config["model"])
        results = model.train(**train_kwargs(config))
    except Exception:
        if registry is not None and run_id is not None:
            registry.finalize_run(run_id, "failed")
        raise

    if registry is not None and run_id is not None:
        registry.finalize_run(run_id, "succeeded")
    print(results)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
