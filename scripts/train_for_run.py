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
import subprocess
import sys
import urllib.request
import zipfile
from datetime import UTC, datetime
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


DEFAULT_EXPORT_OPTIONS = {
    "ios":     {"quantize": True},
    "android": {"quantize": True},
}


def load_export_options(run_config: dict) -> dict:
    """Return {ios:{quantize}, android:{quantize}}.

    Falls back to DEFAULT_EXPORT_OPTIONS for legacy runs or malformed input.
    """
    raw = (
        run_config.get("exportOptions")
        or run_config.get("export_options")
    ) if isinstance(run_config, dict) else None
    if not isinstance(raw, dict):
        return {k: dict(v) for k, v in DEFAULT_EXPORT_OPTIONS.items()}
    result = {k: dict(v) for k, v in DEFAULT_EXPORT_OPTIONS.items()}
    for platform_key in ("ios", "android"):
        entry = raw.get(platform_key)
        if isinstance(entry, dict) and isinstance(entry.get("quantize"), bool):
            result[platform_key]["quantize"] = entry["quantize"]
    return result


def export_kwargs(kind: str, config: dict, quantize: bool) -> dict:
    """Return Ultralytics export kwargs for mobile artifacts.

    When quantize=True:
      - TFLite: INT8 with calibration dataset
      - Core ML: FP16 half-precision weights
    When quantize=False, both formats export at full FP32 precision.
    """
    imgsz = int(config.get("imgsz", 640))
    if kind == "tflite":
        if quantize:
            return {
                "format": "tflite",
                "int8": True,
                "data": str(config.get("data", "")),
                "imgsz": imgsz,
                "batch": 1,
                "fraction": _quant_fraction(os.environ),
            }
        return {"format": "tflite", "imgsz": imgsz}
    if kind == "coreml":
        if quantize:
            return {"format": "coreml", "half": True, "imgsz": imgsz}
        return {"format": "coreml", "imgsz": imgsz}
    raise ValueError(f"unsupported export kind: {kind}")


def export_plan_summary(export_options: dict) -> str:
    android = "INT8 quantized" if export_options["android"]["quantize"] else "FP32 no quantization"
    ios = "FP16 quantized" if export_options["ios"]["quantize"] else "FP32 no quantization"
    return f"Android TF Lite: {android}; iOS Core ML: {ios}"


def build_structured_log_entry(
    *,
    step: int | None,
    phase: str | None,
    status: str,
    message: str,
) -> dict:
    return {
        "ts": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "step": step,
        "phase": phase,
        "status": status,
        "message": message,
    }


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
    if artifact is None:
        return {
            "r2_key": None,
            "size_bytes": None,
            "content_hash": None,
            "quantization": quantization,
        }
    return {
        "r2_key": artifact.r2_key,
        "size_bytes": artifact.size_bytes,
        "content_hash": artifact.content_hash,
        "quantization": quantization,
    }


def platform_export_metadata(export_options: dict, tflite_quantization: dict, coreml_quantization: dict) -> dict:
    return {
        "android": {
            "artifact_kind": "tflite",
            "format": "tf_lite",
            "quantize": bool(export_options.get("android", {}).get("quantize", True)),
            "precision": tflite_quantization.get("precision"),
            "quantization": tflite_quantization,
        },
        "ios": {
            "artifact_kind": "coreml",
            "format": "core_ml",
            "quantize": bool(export_options.get("ios", {}).get("quantize", True)),
            "precision": coreml_quantization.get("precision"),
            "quantization": coreml_quantization,
        },
    }


METRIC_ALIASES = {
    "map50": ("map50", "box.map50", "bbox.map50", "metrics/map50(b)"),
    "map5095": ("map5095", "map50-95", "map50_95", "box.map50-95", "bbox.map50-95", "metrics/map50-95(b)"),
    "precision": ("precision", "box.precision", "bbox.precision", "metrics/precision(b)"),
    "recall": ("recall", "box.recall", "bbox.recall", "metrics/recall(b)"),
    "maskMap50": ("maskmap50", "mask_map50", "mask.map50", "seg.map50", "segment.map50", "metrics/map50(m)"),
    "maskMap5095": ("maskmap5095", "maskmap50-95", "mask_map50_95", "maskmap", "mask_map", "mask.map50-95", "seg.map50-95", "segment.map50-95", "metrics/map50-95(m)"),
    "maskPrecision": ("maskprecision", "mask_precision", "mask.precision", "seg.precision", "segment.precision", "metrics/precision(m)"),
    "maskRecall": ("maskrecall", "mask_recall", "mask.recall", "seg.recall", "segment.recall", "metrics/recall(m)"),
}


def _metric_name(value: str) -> str:
    return "".join(ch for ch in value.strip().lower() if ch.isalnum())


def normalize_metric_summary(raw_metrics: dict) -> dict:
    numeric_raw = {}
    for key, value in raw_metrics.items():
        try:
            numeric_raw[str(key)] = float(value)
        except (TypeError, ValueError):
            continue
    summary = {"raw": numeric_raw}
    normalized_raw = {_metric_name(key): value for key, value in numeric_raw.items()}
    for target, aliases in METRIC_ALIASES.items():
        for alias in aliases:
            normalized_alias = _metric_name(alias)
            if normalized_alias in normalized_raw:
                summary[target] = normalized_raw[normalized_alias]
                break
    return summary


def current_git_sha(repo_root: Path) -> str | None:
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=repo_root,
            check=True,
            capture_output=True,
            text=True,
        )
    except (OSError, subprocess.CalledProcessError):
        return None
    sha = result.stdout.strip()
    return sha or None


def resolve_pytorch_weights(save_dir: Path) -> Path:
    for filename in ("best.pt", "last.pt"):
        candidate = save_dir / "weights" / filename
        if candidate.exists():
            return candidate
    raise FileNotFoundError(f"No PyTorch weights found under {save_dir / 'weights'}")


def build_version_metadata(
    *,
    run_row: dict,
    config: dict,
    results,
    pytorch_artifact,
    tflite_artifact,
    coreml_artifact,
    tflite_quantization: dict,
    coreml_quantization: dict,
    host: str,
    git_sha: str | None,
) -> dict:
    metrics_dict = getattr(results, "results_dict", {}) or {}
    run_config = run_row.get("config_yaml", {}) if isinstance(run_row, dict) else {}
    export_options = load_export_options(run_config)
    metadata = {
        "dataset": run_config.get("dataset"),
        "source_weights": run_config.get("source_weights"),
        "class_names": run_config.get("classes", []),
        "input_size": int(config.get("imgsz", 640)),
        "output_kind": "segmentation-mask",
        "task": "segmentation",
        "hyperparameters": run_config.get("hyperparameters", {}),
        "export_options": export_options,
        "mobile_exports": platform_export_metadata(export_options, tflite_quantization, coreml_quantization),
        "metrics": normalize_metric_summary(metrics_dict),
        "artifacts": {
            "pytorch": artifact_metadata(
                kind="pytorch",
                artifact=pytorch_artifact,
                quantization={"precision": "fp32", "method": "none", "source": "best_weights"},
            ),
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
        "host": host,
    }
    if git_sha:
        metadata["export_git_sha"] = git_sha
    return metadata


def validate_local_qa_artifact(metadata: dict, pytorch_r2_key: str) -> None:
    if not pytorch_r2_key or not pytorch_r2_key.endswith(".pt"):
        raise ValueError(f"Local QA PyTorch artifact key must point to a .pt file: {pytorch_r2_key!r}")
    pytorch = (metadata.get("artifacts") or {}).get("pytorch") if isinstance(metadata, dict) else None
    if not isinstance(pytorch, dict):
        raise ValueError("Version metadata is missing artifacts.pytorch")
    if pytorch.get("r2_key") != pytorch_r2_key:
        raise ValueError("Version metadata artifacts.pytorch.r2_key does not match versions.pytorch_r2_key")
    quantization = pytorch.get("quantization") or {}
    if quantization.get("precision") != "fp32" or quantization.get("method") != "none":
        raise ValueError("Local QA PyTorch artifact must be recorded as non-quantized fp32")


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


def cleanup_dataset_bundle(client: RegistryClient, run_id: str, append_log) -> None:
    """Delete the temporary dataset ZIP after the run reaches a terminal state."""
    try:
        rows = client._json("GET", f"/rest/v1/runs?id=eq.{run_id}&select=config_yaml", None)
        if not rows:
            return
        cfg = rows[0].get("config_yaml") or {}
        bundle_ref = str(cfg.get("dataset_bundle") or "")
        if not bundle_ref:
            return
        if cfg.get("dataset_bundle_deleted_at"):
            return
        if not bundle_ref.startswith("datasets/"):
            append_log(f"Dataset bundle cleanup skipped for non-R2 key: {bundle_ref}")
            return
        client.delete_dataset_bundle(bundle_ref)
        cfg["dataset_bundle_deleted_at"] = datetime.now(UTC).isoformat()
        cfg["dataset_bundle_deleted_key"] = bundle_ref
        cfg["dataset_bundle"] = None
        client._json("PATCH", f"/rest/v1/runs?id=eq.{run_id}", {"config_yaml": cfg})
        append_log(f"Deleted temporary dataset bundle from R2: {bundle_ref}")
    except Exception as exc:
        print(f"[dataset_bundle] cleanup failed: {exc}", file=sys.stderr)
        try:
            append_log(f"Dataset bundle cleanup failed: {exc}")
        except Exception:
            pass


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
    git_sha = current_git_sha(repo_root)

    run_row = fetch_run(client, args.run_id)
    config = build_training_config(run_row, repo_root, client)
    export_options = load_export_options(run_row.get("config_yaml") or {})

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

    def append_log_entry(entry: dict | str) -> None:
        """Append one entry (structured dict or legacy string) to runs.config_yaml.logs."""
        try:
            rows = client._json("GET", f"/rest/v1/runs?id=eq.{args.run_id}&select=config_yaml", None)
            if not rows:
                return
            cfg = rows[0].get("config_yaml") or {}
            logs = list(cfg.get("logs") or [])
            logs.append(entry)
            cfg["logs"] = logs
            client._json("PATCH", f"/rest/v1/runs?id=eq.{args.run_id}", {"config_yaml": cfg})
        except Exception as exc:
            print(f"[logs] append_log_entry failed: {exc}", file=sys.stderr)

    def log_step(step: int | None, phase: str | None, status: str, message: str) -> None:
        append_log_entry(build_structured_log_entry(step=step, phase=phase, status=status, message=message))

    def append_log(line: str) -> None:  # kept so existing free-text calls still work
        append_log_entry(build_structured_log_entry(step=None, phase=None, status="info", message=line))

    def finalize_run(status: str) -> None:
        cleanup_dataset_bundle(client, args.run_id, append_log)
        client.finalize_run(args.run_id, status)

    log_step(5, "dataset-ready", "ok",
             f"Dataset ready · data={config.get('data')} epochs={total_epochs}")

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
            except Exception as exc:
                print(f"[metrics] log_metrics failed: {exc}", file=sys.stderr)

        map50 = next((r["value"] for r in rows if r["name"].lower() in {"metrics/map50(b)", "map50"}), None)
        mask = next((r["value"] for r in rows if r["name"].lower() in {"metrics/map50-95(m)", "mask_map"}), None)
        bits = [f"Epoch {epoch}/{total_epochs}", f"progress={progress}%"]
        if map50 is not None: bits.append(f"mAP50={map50:.3f}")
        if mask is not None: bits.append(f"mask_mAP={mask:.3f}")
        log_step(5, "training", "info", " | ".join(bits))

    model.add_callback("on_fit_epoch_end", on_fit_epoch_end)

    gpu = config.get("hardware", {}).get("gpu_name") or "unknown GPU"
    log_step(5, "model-init", "ok", f"Training started on {gpu}, target epochs={total_epochs}")
    log_step(5, "model-init", "info", f"Export options resolved — {export_plan_summary(export_options)}")
    if git_sha:
        log_step(5, "model-init", "info", f"Training script git={git_sha}")

    try:
        results = model.train(**train_kwargs(config))
    except Exception as exc:
        append_log(f"Training failed: {exc}")
        finalize_run("failed")
        raise

    log_step(5, "training", "ok", "Training finished — beginning exports")

    save_dir = Path(getattr(results, "save_dir", config.get("project", "runs")))
    try:
        best = resolve_pytorch_weights(save_dir)
    except FileNotFoundError as exc:
        append_log(f"Local QA PyTorch export failed: {exc}")
        finalize_run("failed")
        raise
    print("Local QA PyTorch weights:", best)

    tflite_path: Path | None = None
    tflite_artifact = None
    android_quantize = export_options["android"]["quantize"]
    tflite_export_kwargs = export_kwargs("tflite", config, android_quantize)
    tflite_quantization = quantization_metadata("tflite", tflite_export_kwargs)
    precision_label = tflite_quantization["precision"].upper()
    log_step(5, "export", "started",
             f"TFLite {precision_label} export starting"
             + (f" (fraction={tflite_export_kwargs.get('fraction')})" if android_quantize else " (no quantization)"))
    try:
        export_path = model.export(**tflite_export_kwargs)
        export_path = export_path[0] if isinstance(export_path, (list, tuple)) else export_path
        tflite_path = Path(export_path) if export_path else None
        if not tflite_path or not tflite_path.exists():
            raise FileNotFoundError("TFLite export returned no artifact")
        log_step(5, "export", "ok", f"TFLite export done · {tflite_path.name}")
    except Exception as exc:
        tflite_quantization = {"precision": "failed", "method": "none", "target": "tflite"}
        tflite_path = None
        log_step(5, "export", "error", f"TFLite export failed: {exc}")

    coreml_path: Path | None = None
    coreml_artifact = None
    ios_quantize = export_options["ios"]["quantize"]
    coreml_export_kwargs = export_kwargs("coreml", config, ios_quantize)
    coreml_quantization = quantization_metadata("coreml", coreml_export_kwargs)
    precision_label = coreml_quantization["precision"].upper()
    log_step(5, "export", "started",
             f"Core ML {precision_label} export starting"
             + ("" if ios_quantize else " (no quantization)"))
    try:
        export_path = model.export(**coreml_export_kwargs)
        export_path = export_path[0] if isinstance(export_path, (list, tuple)) else export_path
        coreml_path = Path(export_path) if export_path else None
        if not coreml_path or not coreml_path.exists():
            raise FileNotFoundError("Core ML export returned no artifact")
        log_step(5, "export", "ok", f"Core ML export done · {coreml_path.name}")
    except Exception as exc:
        coreml_quantization = {"precision": "failed", "method": "none", "target": "coreml"}
        coreml_path = None
        log_step(5, "export", "error", f"Core ML export failed: {exc}")

    semver = f"1.0.0-{args.run_id[:8]}"
    append_log(f"Preserving original PyTorch weights for local segmentation QA: {best.name}")
    pytorch_artifact = client.upload_artifact(
        best,
        kind="pytorch",
        run_id=args.run_id,
        semver=semver,
        content_type="application/octet-stream",
    )
    if not pytorch_artifact.r2_key.endswith(".pt"):
        append_log(f"Local QA PyTorch upload returned an invalid key: {pytorch_artifact.r2_key}")
        finalize_run("failed")
        raise ValueError(f"Local QA PyTorch upload returned an invalid key: {pytorch_artifact.r2_key}")
    append_log(f"Uploaded Local QA PyTorch artifact: {pytorch_artifact.r2_key}")

    log_step(5, "upload", "started", "Uploading produced artifacts to R2")

    if tflite_path is not None:
        tflite_artifact = client.upload_artifact(
            tflite_path, kind="tflite", run_id=args.run_id, semver=semver,
        )

    if coreml_path is not None:
        coreml_artifact = client.upload_artifact(
            coreml_path, kind="coreml", run_id=args.run_id, semver=semver,
            content_type="application/zip" if coreml_path.is_dir() else None,
        )

    uploaded_count = sum(1 for a in [pytorch_artifact, tflite_artifact, coreml_artifact] if a is not None)
    log_step(5, "upload", "ok", f"Uploaded {uploaded_count} artifacts")

    # build_version_metadata must accept None artifacts — handled in Task 5.
    metadata = build_version_metadata(
        run_row=run_row,
        config=config,
        results=results,
        pytorch_artifact=pytorch_artifact,
        tflite_artifact=tflite_artifact,
        coreml_artifact=coreml_artifact,
        tflite_quantization=tflite_quantization,
        coreml_quantization=coreml_quantization,
        host=platform.node() or "colab",
        git_sha=git_sha,
    )
    try:
        validate_local_qa_artifact(metadata, pytorch_artifact.r2_key)
    except ValueError as exc:
        append_log(f"Local QA PyTorch artifact validation failed: {exc}")
        finalize_run("failed")
        raise

    client.create_version(
        run_id=args.run_id,
        model_line_id=run_row["model_line_id"],
        semver=semver,
        metadata=metadata,
        tflite_r2_key=tflite_artifact.r2_key if tflite_artifact else None,
        mlmodel_r2_key=coreml_artifact.r2_key if coreml_artifact else None,
        pytorch_r2_key=pytorch_artifact.r2_key,
        size_bytes=(tflite_artifact.size_bytes if tflite_artifact
                    else coreml_artifact.size_bytes if coreml_artifact
                    else pytorch_artifact.size_bytes),
        content_hash=(tflite_artifact.content_hash if tflite_artifact
                      else coreml_artifact.content_hash if coreml_artifact
                      else pytorch_artifact.content_hash),
    )

    log_step(6, None, "ok",
             f"Version {semver} created · "
             f"tflite={tflite_quantization['precision']} coreml={coreml_quantization['precision']}")
    finalize_run("succeeded")
    print("Run finalized — switch back to the dashboard.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
