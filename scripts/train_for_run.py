#!/usr/bin/env python3
"""Train YOLO for an existing dashboard-created run row.

Reads the run row from Supabase, runs Ultralytics training with the run's
config, streams per-epoch metrics to ``run_metrics``, uploads the exported
tflite to R2, creates the candidate version, and finalizes the run.

Designed for the Colab "Open in Colab" flow — the dashboard inserts the run
row, the notebook calls this script with --run-id.
"""
from __future__ import annotations

import argparse
import json
import os
import platform
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from advance_seeds_ml.registry import RegistryClient, RegistryConfig
from advance_seeds_ml.training import (
    apply_hardware_profile,
    detect_hardware,
    materialize_ultralytics_dataset_config,
    resolve_training_paths,
    train_kwargs,
)


def fetch_run(client: RegistryClient, run_id: str) -> dict:
    rows = client._json("GET", f"/rest/v1/runs?id=eq.{run_id}&select=*", None)
    if not rows:
        raise SystemExit(f"Run {run_id} not found in Supabase.")
    return rows[0]


def build_training_config(run_row: dict, repo_root: Path) -> dict:
    cfg_yaml = run_row.get("config_yaml") or {}
    hp = cfg_yaml.get("hyperparameters") or {}
    config: dict = {
        "model": cfg_yaml.get("source_weights") or "yolo26n-seg.pt",
        "data": cfg_yaml.get("dataset") or "",
        "project": "runs",
        "name": cfg_yaml.get("name") or run_row["id"],
        "epochs": int(hp.get("epochs", 1)),
        "imgsz": int(hp.get("imgsz", 640)),
        "batch": hp.get("batch", "auto"),
        "patience": int(hp.get("patience", 10)),
        "lr0": float(hp.get("lr0", 0.001)),
        "lrf": float(hp.get("lrf", 0.01)),
        "mosaic": float(hp.get("mosaic", 0.0)),
        "mixup": float(hp.get("mixup", 0.0)),
        "copy_paste": float(hp.get("copy_paste", hp.get("copyPaste", 0.0))),
    }
    if not config["data"]:
        raise SystemExit("Run has no dataset reference in config_yaml.dataset.")
    config = apply_hardware_profile(config, detect_hardware())
    config = resolve_training_paths(config, repo_root)
    config = materialize_ultralytics_dataset_config(config, repo_root / "runs" / "_runtime_datasets")
    return config


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-id", required=True, help="UUID of the runs row created by the dashboard.")
    parser.add_argument("--dry-run", action="store_true", help="Print the resolved config and exit.")
    args = parser.parse_args(argv)

    repo_root = Path(__file__).resolve().parents[1]
    client = RegistryClient(RegistryConfig.from_env())

    run_row = fetch_run(client, args.run_id)
    config = build_training_config(run_row, repo_root)

    print("Resolved training config:")
    print(json.dumps(config, indent=2, default=str))

    if args.dry_run:
        return 0

    try:
        from ultralytics import YOLO
    except ModuleNotFoundError as exc:
        raise SystemExit("ultralytics not installed. pip install ultralytics") from exc

    total_epochs = max(1, int(config.get("epochs", 1)))

    model = YOLO(config["model"])

    def on_fit_epoch_end(trainer):  # type: ignore[no-untyped-def]
        epoch = int(getattr(trainer, "epoch", 0)) + 1
        rows = []
        metrics = getattr(trainer, "metrics", None) or {}
        for name, value in metrics.items():
            try:
                rows.append({"step": epoch, "epoch": epoch, "name": str(name), "value": float(value)})
            except (TypeError, ValueError):
                continue
        progress = round(epoch / total_epochs * 100, 1)
        rows.append({"step": epoch, "epoch": epoch, "name": "progress", "value": progress})
        if rows:
            try:
                client.log_metrics(args.run_id, rows)
            except Exception as exc:  # don't crash training because of metric reporting
                print(f"[metrics] log_metrics failed: {exc}", file=sys.stderr)

    model.add_callback("on_fit_epoch_end", on_fit_epoch_end)

    try:
        results = model.train(**train_kwargs(config))
    except Exception:
        client.finalize_run(args.run_id, "failed")
        raise

    save_dir = Path(getattr(results, "save_dir", config.get("project", "runs")))
    best = save_dir / "weights" / "best.pt"
    print("Best weights:", best if best.exists() else "(missing — using last.pt)")
    if not best.exists():
        best = save_dir / "weights" / "last.pt"

    semver = f"1.0.0-{args.run_id[:8]}"
    artifact_path = best
    try:
        export_path = model.export(format="tflite")
        export_path = export_path[0] if isinstance(export_path, (list, tuple)) else export_path
        artifact_path = Path(export_path) if export_path else best
    except Exception as exc:
        print(f"[export] tflite export failed, uploading .pt instead: {exc}", file=sys.stderr)

    artifact = client.upload_artifact(
        artifact_path,
        kind="tflite" if artifact_path.suffix == ".tflite" else "tflite",
        run_id=args.run_id,
        semver=semver,
    )

    metrics_dict = getattr(results, "results_dict", {}) or {}
    client.create_version(
        run_id=args.run_id,
        model_line_id=run_row["model_line_id"],
        semver=semver,
        metadata={
            "dataset": run_row.get("config_yaml", {}).get("dataset"),
            "source_weights": run_row.get("config_yaml", {}).get("source_weights"),
            "class_names": run_row.get("config_yaml", {}).get("classes", []),
            "hyperparameters": run_row.get("config_yaml", {}).get("hyperparameters", {}),
            "metrics": {
                "map50": float(metrics_dict.get("metrics/mAP50(B)", 0.0)),
                "mask_map": float(metrics_dict.get("metrics/mAP50-95(M)", 0.0)),
            },
            "host": platform.node() or "colab",
        },
        tflite_r2_key=artifact.r2_key,
        size_bytes=artifact.size_bytes,
        content_hash=artifact.content_hash,
    )

    client.finalize_run(args.run_id, "succeeded")
    print("Run finalized — switch back to the dashboard.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
