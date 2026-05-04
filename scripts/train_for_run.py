#!/usr/bin/env python3
"""Train YOLO for an existing dashboard-created run row.

Reads the run row from Supabase, runs Ultralytics training with the run's
config, streams per-epoch metrics to ``run_metrics``, uploads optimized
mobile exports to R2, creates the candidate version, and finalizes the run.

Designed for the Colab "Open in Colab" flow — the dashboard inserts the run
row, the notebook calls this script with --run-id.
"""
from __future__ import annotations

import argparse
import json
import os
import platform
import sys
import urllib.request
import zipfile
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


def _env_bool(env: dict[str, str], key: str) -> bool:
    return str(env.get(key, "")).strip().lower() in {"1", "true", "yes", "on"}


def _quant_fraction(env: dict[str, str]) -> float:
    raw = str(env.get("ADVANCE_SEEDS_QUANT_FRACTION", "1.0")).strip() or "1.0"
    try:
        fraction = float(raw)
    except ValueError:
        return 1.0
    return min(1.0, max(0.01, fraction))


def export_kwargs(kind: str, config: dict, env: dict[str, str] | None = None) -> dict:
    """Return Ultralytics export kwargs for mobile artifacts.

    Android uses calibrated INT8 TFLite because TF Lite has mature post-training
    integer quantization. iOS uses FP16 Core ML by default for broader Core ML /
    ANE compatibility; Core ML INT8 can be enabled explicitly for device tests.
    """
    source = os.environ if env is None else env
    imgsz = int(config.get("imgsz", 640))
    data = str(config.get("data", ""))
    fraction = _quant_fraction(source)
    if kind == "tflite":
        return {
            "format": "tflite",
            "int8": True,
            "data": data,
            "imgsz": imgsz,
            "batch": 1,
            "fraction": fraction,
        }
    if kind == "coreml" and _env_bool(source, "ADVANCE_SEEDS_COREML_INT8"):
        return {
            "format": "coreml",
            "int8": True,
            "data": data,
            "imgsz": imgsz,
            "batch": 1,
            "fraction": fraction,
        }
    if kind == "coreml":
        return {
            "format": "coreml",
            "half": True,
            "imgsz": imgsz,
        }
    raise ValueError(f"unsupported export kind: {kind}")


def quantization_metadata(kind: str, kwargs: dict) -> dict:
    if kwargs.get("int8"):
        return {
            "precision": "int8",
            "method": "post_training_static",
            "calibration": "representative_dataset",
            "calibration_data": kwargs.get("data"),
            "calibration_fraction": kwargs.get("fraction"),
            "batch": kwargs.get("batch"),
        }
    if kwargs.get("half"):
        return {
            "precision": "fp16",
            "method": "post_training_weight_quantization",
            "target": "coreml",
        }
    return {"precision": "fp32", "method": "none", "target": kind}


def artifact_metadata(*, kind: str, artifact, quantization: dict) -> dict:
    return {
        "r2_key": artifact.r2_key,
        "size_bytes": artifact.size_bytes,
        "content_hash": artifact.content_hash,
        "quantization": quantization,
    }


def fetch_run(client: RegistryClient, run_id: str) -> dict:
    rows = client._json("GET", f"/rest/v1/runs?id=eq.{run_id}&select=*", None)
    if not rows:
        raise SystemExit(f"Run {run_id} not found in Supabase.")
    return rows[0]


def materialize_dataset_yaml(client: RegistryClient, dataset_ref: str, repo_root: Path) -> str:
    """If the dataset reference is an R2 key (datasets/...), download the YAML
    via the download-dataset Edge Function and return the local path. Otherwise
    return the input unchanged."""
    if not dataset_ref.startswith("datasets/"):
        return dataset_ref
    print(f"Fetching YAML from R2: {dataset_ref}")
    response = client._json(
        "POST",
        "/functions/v1/download-dataset",
        {"r2_key": dataset_ref},
    )
    download_url = response.get("download_url") if isinstance(response, dict) else None
    if not download_url:
        raise SystemExit(f"download-dataset returned no download_url: {response!r}")
    local_dir = repo_root / "configs"
    local_dir.mkdir(exist_ok=True)
    local_path = local_dir / Path(dataset_ref).name
    with urllib.request.urlopen(download_url) as resp:
        local_path.write_bytes(resp.read())
    print(f"YAML written to {local_path}")
    return str(local_path)


def materialize_dataset_bundle(client: RegistryClient, bundle_ref: str, dataset_yaml: str, repo_root: Path) -> Path | None:
    """Download and extract an optional dataset ZIP uploaded through the dashboard.

    The YAML remains authoritative for the expected dataset root and split
    paths. The ZIP may either start at that root (images/train, labels/train,
    ...) or include the repo-relative root path (data/processed/images/train,
    ...). We choose the extraction target from the archive entries.
    """
    if not bundle_ref:
        print("No dataset bundle attached; expecting images to already exist on disk.")
        return None
    if not bundle_ref.startswith("datasets/"):
        print(f"Dataset bundle is not an R2 dataset key; skipping automatic download: {bundle_ref}")
        return None

    import yaml as _yaml

    dataset_path = Path(dataset_yaml).expanduser().resolve()
    doc = _yaml.safe_load(dataset_path.read_text()) or {}
    if not isinstance(doc, dict):
        raise SystemExit(f"Dataset YAML is not a mapping: {dataset_path}")

    dataset_root = Path(str(doc.get("path", "."))).expanduser()
    if not dataset_root.is_absolute():
        dataset_root = (dataset_path.parent / dataset_root).resolve()
    repo_relative_root = _relative_to_or_none(dataset_root, repo_root)

    print(f"Fetching dataset bundle from R2: {bundle_ref}")
    response = client._json("POST", "/functions/v1/download-dataset", {"r2_key": bundle_ref})
    download_url = response.get("download_url") if isinstance(response, dict) else None
    if not download_url:
        raise SystemExit(f"download-dataset returned no download_url for bundle: {response!r}")

    bundle_dir = repo_root / "runs" / "_runtime_datasets" / "_bundles"
    bundle_dir.mkdir(parents=True, exist_ok=True)
    local_zip = bundle_dir / Path(bundle_ref).name
    with urllib.request.urlopen(download_url) as resp:
        local_zip.write_bytes(resp.read())

    with zipfile.ZipFile(local_zip) as archive:
        names = [name for name in archive.namelist() if name and not name.endswith("/")]
        target = _dataset_bundle_extract_target(names, doc, dataset_root, repo_root, repo_relative_root)
        target.mkdir(parents=True, exist_ok=True)
        print(f"Extracting dataset bundle {local_zip} -> {target}")
        archive.extractall(target)
    return target


def _relative_to_or_none(path: Path, parent: Path) -> Path | None:
    try:
        return path.resolve().relative_to(parent.resolve())
    except ValueError:
        return None


def _dataset_bundle_extract_target(
    names: list[str],
    dataset: dict,
    dataset_root: Path,
    repo_root: Path,
    repo_relative_root: Path | None,
) -> Path:
    normalized = [name.lstrip("./") for name in names]
    split_paths = [
        str(value).strip().strip("/")
        for value in (dataset.get("train"), dataset.get("val") or dataset.get("validation"), dataset.get("test"))
        if isinstance(value, str) and value.strip()
    ]
    if split_paths and any(any(name.startswith(f"{split}/") for name in normalized) for split in split_paths):
        return dataset_root
    if repo_relative_root is not None:
        root_prefix = str(repo_relative_root).strip("/")
        if root_prefix and any(name.startswith(f"{root_prefix}/") for name in normalized):
            return repo_root
    return dataset_root


def write_dataset_stats(client: RegistryClient, run_id: str, run_row: dict, config: dict) -> None:
    """Walk the resolved train/val/test image dirs from the materialized YAML
    and PATCH runs.config_yaml.dataset_stats with real counts. The dashboard's
    DATASET IMAGES section reads this via Realtime, replacing the '—' it shows
    pre-scan."""
    try:
        import yaml as _yaml
        materialized_path = Path(config.get("data", ""))
        if not materialized_path.exists():
            return
        doc = _yaml.safe_load(materialized_path.read_text())
        if not isinstance(doc, dict):
            return
        root_str = str(doc.get("path", ""))
        if not root_str:
            return
        root = Path(root_str)
        if not root.is_absolute():
            root = (materialized_path.parent / root).resolve()
        image_exts = {".jpg", ".jpeg", ".png", ".bmp", ".webp", ".tif", ".tiff"}

        def _count(rel: str | None) -> int | None:
            if not rel:
                return None
            d = (root / rel).resolve()
            if not d.exists():
                return None
            return sum(1 for p in d.rglob("*") if p.is_file() and p.suffix.lower() in image_exts)

        train_path = doc.get("train")
        val_path = doc.get("val") or doc.get("validation")
        test_path = doc.get("test") or doc.get("testing")
        train_n = _count(train_path)
        val_n = _count(val_path)
        test_n = _count(test_path)
        total = sum(n for n in (train_n, val_n, test_n) if n is not None) or None
        stats: dict = {
            "total": total,
            "train": train_n,
            "validation": val_n,
            "testing": test_n,
            "trainPath": str((root / train_path).resolve()) if train_path else None,
            "validationPath": str((root / val_path).resolve()) if val_path else None,
            "testingPath": str((root / test_path).resolve()) if test_path else None,
        }
        cfg_yaml = run_row.get("config_yaml") or {}
        cfg_yaml["dataset_stats"] = stats
        client._json("PATCH", f"/rest/v1/runs?id=eq.{run_id}", {"config_yaml": cfg_yaml})
        print(f"Reported dataset_stats: total={total} train={train_n} val={val_n} test={test_n}")
    except Exception as exc:
        print(f"[dataset_stats] failed to scan/report: {exc}", file=sys.stderr)


def build_training_config(run_row: dict, repo_root: Path, client: RegistryClient) -> dict:
    cfg_yaml = run_row.get("config_yaml") or {}
    hp = cfg_yaml.get("hyperparameters") or {}
    dataset_ref = cfg_yaml.get("dataset") or ""
    if not dataset_ref:
        raise SystemExit("Run has no dataset reference in config_yaml.dataset.")
    dataset_local = materialize_dataset_yaml(client, dataset_ref, repo_root)
    materialize_dataset_bundle(client, cfg_yaml.get("dataset_bundle") or "", dataset_local, repo_root)
    config: dict = {
        "model": cfg_yaml.get("source_weights") or "yolo26n-seg.pt",
        "data": dataset_local,
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
    config = build_training_config(run_row, repo_root, client)

    print("Resolved training config:")
    print(json.dumps(config, indent=2, default=str))

    # Scan the resolved image dirs and PATCH dataset_stats so the dashboard
    # can replace the '—' placeholders with real numbers via Realtime.
    write_dataset_stats(client, args.run_id, run_row, config)

    if args.dry_run:
        return 0

    try:
        from ultralytics import YOLO
    except ModuleNotFoundError as exc:
        raise SystemExit("ultralytics not installed. pip install ultralytics") from exc

    total_epochs = max(1, int(config.get("epochs", 1)))

    model = YOLO(config["model"])

    def append_log(line: str) -> None:
        """Append one line to runs.config_yaml.logs so the dashboard's RUN LOGS
        panel updates in near-real-time. Read-modify-write on the JSONB column;
        fine at PoC scale, swap for an append-only run_logs table later."""
        try:
            rows = client._json("GET", f"/rest/v1/runs?id=eq.{args.run_id}&select=config_yaml", None)
            if not rows:
                return
            cfg = rows[0].get("config_yaml") or {}
            logs = list(cfg.get("logs") or [])
            logs.append(line)
            cfg["logs"] = logs
            client._json("PATCH", f"/rest/v1/runs?id=eq.{args.run_id}", {"config_yaml": cfg})
        except Exception as exc:
            print(f"[logs] append_log failed: {exc}", file=sys.stderr)

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
            except Exception as exc:
                print(f"[metrics] log_metrics failed: {exc}", file=sys.stderr)

        map50 = next((r["value"] for r in rows if r["name"].lower() in {"metrics/map50(b)", "map50"}), None)
        mask = next((r["value"] for r in rows if r["name"].lower() in {"metrics/map50-95(m)", "mask_map"}), None)
        bits = [f"Epoch {epoch}/{total_epochs}", f"progress={progress}%"]
        if map50 is not None: bits.append(f"mAP50={map50:.3f}")
        if mask is not None: bits.append(f"mask_mAP={mask:.3f}")
        append_log(" | ".join(bits))

    model.add_callback("on_fit_epoch_end", on_fit_epoch_end)

    gpu = config.get("hardware", {}).get("gpu_name") or "unknown GPU"
    append_log(f"Training started on {gpu}, target epochs={total_epochs}")

    try:
        results = model.train(**train_kwargs(config))
    except Exception as exc:
        append_log(f"Training failed: {exc}")
        client.finalize_run(args.run_id, "failed")
        raise

    append_log("Training finished — exporting quantized mobile artifacts")

    save_dir = Path(getattr(results, "save_dir", config.get("project", "runs")))
    best = save_dir / "weights" / "best.pt"
    print("Best weights:", best if best.exists() else "(missing — using last.pt)")
    if not best.exists():
        best = save_dir / "weights" / "last.pt"

    semver = f"1.0.0-{args.run_id[:8]}"
    tflite_path: Path
    tflite_export_kwargs = export_kwargs("tflite", config)
    tflite_quantization = quantization_metadata("tflite", tflite_export_kwargs)
    try:
        append_log(
            "Exporting Android TF Lite with INT8 calibration "
            f"(fraction={tflite_export_kwargs.get('fraction')}, data={tflite_export_kwargs.get('data')})"
        )
        export_path = model.export(**tflite_export_kwargs)
        export_path = export_path[0] if isinstance(export_path, (list, tuple)) else export_path
        tflite_path = Path(export_path) if export_path else best
    except Exception as exc:
        append_log(f"TF Lite export failed: {exc}")
        client.finalize_run(args.run_id, "failed")
        raise

    coreml_path: Path | None = None
    coreml_export_kwargs = export_kwargs("coreml", config)
    coreml_quantization = quantization_metadata("coreml", coreml_export_kwargs)
    try:
        append_log(
            "Exporting iOS Core ML with "
            f"{coreml_quantization.get('precision', 'fp32').upper()} optimization"
        )
        export_path = model.export(**coreml_export_kwargs)
        export_path = export_path[0] if isinstance(export_path, (list, tuple)) else export_path
        coreml_path = Path(export_path) if export_path else None
        if not coreml_path or not coreml_path.exists():
            raise FileNotFoundError("Core ML export returned no artifact")
    except Exception as exc:
        append_log(f"Core ML export failed: {exc}")
        client.finalize_run(args.run_id, "failed")
        raise

    tflite_artifact = client.upload_artifact(
        tflite_path,
        kind="tflite",
        run_id=args.run_id,
        semver=semver,
    )
    coreml_artifact = client.upload_artifact(
        coreml_path,
        kind="coreml",
        run_id=args.run_id,
        semver=semver,
        content_type="application/zip" if coreml_path.is_dir() else None,
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
            "artifacts": {
                "tflite": artifact_metadata(
                    kind="tflite",
                    artifact=tflite_artifact,
                    quantization=tflite_quantization,
                ),
                "coreml": {
                    **artifact_metadata(
                        kind="coreml",
                        artifact=coreml_artifact,
                        quantization=coreml_quantization,
                    ),
                    "packaging": "mlpackage.zip",
                },
            },
            "host": platform.node() or "colab",
        },
        tflite_r2_key=tflite_artifact.r2_key,
        mlmodel_r2_key=coreml_artifact.r2_key,
        size_bytes=tflite_artifact.size_bytes,
        content_hash=tflite_artifact.content_hash,
    )

    client.finalize_run(args.run_id, "succeeded")
    print("Run finalized — switch back to the dashboard.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
