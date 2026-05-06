#!/usr/bin/env python3
"""Backfill the Local QA PyTorch artifact for an existing model version.

Use this when an older Colab runtime registered a version before the `.pt`
artifact upload was added. The script uploads an existing best.pt/last.pt to R2
through the registry API and patches the existing versions row.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import quote

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from advance_seeds_ml.registry import RegistryClient, RegistryConfig


def _query_value(value: str) -> str:
    return quote(value, safe="")


def _first_row(rows, label: str) -> dict:
    if not rows:
        raise SystemExit(f"{label} not found.")
    if not isinstance(rows, list) or not isinstance(rows[0], dict):
        raise SystemExit(f"{label} returned an unexpected response shape: {rows!r}")
    return rows[0]


def fetch_version(client: RegistryClient, *, semver: str | None, run_id: str | None) -> dict:
    if semver:
        rows = client._json("GET", f"/rest/v1/versions?semver=eq.{_query_value(semver)}&select=*", None)
        return _first_row(rows, f"Version {semver}")
    if run_id:
        rows = client._json("GET", f"/rest/v1/versions?run_id=eq.{_query_value(run_id)}&select=*", None)
        return _first_row(rows, f"Version for run {run_id}")
    raise SystemExit("Provide --semver or --run-id.")


def fetch_run(client: RegistryClient, run_id: str) -> dict:
    rows = client._json("GET", f"/rest/v1/runs?id=eq.{_query_value(run_id)}&select=*", None)
    return _first_row(rows, f"Run {run_id}")


def candidate_weight_paths(repo_root: Path, run: dict) -> list[Path]:
    cfg = run.get("config_yaml") or {}
    names = [str(cfg.get("name") or "").strip(), str(run.get("id") or "").strip()]
    paths: list[Path] = []
    for name in [name for name in names if name]:
        paths.extend(
            [
                repo_root / "runs" / name / "weights" / "best.pt",
                repo_root / "runs" / name / "weights" / "last.pt",
            ]
        )
    seen: set[Path] = set()
    unique: list[Path] = []
    for path in paths:
        resolved = path.resolve()
        if resolved not in seen:
            unique.append(path)
            seen.add(resolved)
    return unique


def resolve_weights_path(repo_root: Path, run: dict, explicit: str | None) -> Path:
    if explicit:
        path = Path(explicit).expanduser()
        if not path.exists():
            raise SystemExit(f"Weights file does not exist: {path}")
        if path.suffix != ".pt":
            raise SystemExit(f"Weights file must be a .pt artifact: {path}")
        return path
    for path in candidate_weight_paths(repo_root, run):
        if path.exists():
            return path
    candidates = "\n".join(str(path) for path in candidate_weight_paths(repo_root, run)[:8])
    raise SystemExit(
        "No local best.pt or last.pt was found for this run. Re-run in Colab with --weights, for example:\n"
        "python3 scripts/backfill_pytorch_artifact.py --semver 1.0.0-394a0834 "
        "--weights /content/advance-seeds-field-inspector-ml/runs/<run-name>/weights/best.pt\n"
        f"Checked:\n{candidates}"
    )


def patched_metadata(version: dict, artifact) -> dict:
    metadata = dict(version.get("metadata") or {})
    artifacts = dict(metadata.get("artifacts") or {})
    artifacts["pytorch"] = {
        "r2_key": artifact.r2_key,
        "size_bytes": artifact.size_bytes,
        "content_hash": artifact.content_hash,
        "quantization": {"precision": "fp32", "method": "none", "source": "backfilled_weights"},
        "backfilled_at": datetime.now(UTC).isoformat(),
    }
    metadata["artifacts"] = artifacts
    return metadata


def append_run_log(client: RegistryClient, run: dict, line: str) -> None:
    cfg = dict(run.get("config_yaml") or {})
    logs = list(cfg.get("logs") or [])
    logs.append(line)
    cfg["logs"] = logs
    client._json("PATCH", f"/rest/v1/runs?id=eq.{_query_value(run['id'])}", {"config_yaml": cfg})


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--semver", help="Existing versions.semver value to repair.")
    group.add_argument("--run-id", help="Existing run id whose version should be repaired.")
    parser.add_argument("--weights", help="Path to best.pt or last.pt. Required when running outside the Colab runtime.")
    parser.add_argument("--repo-root", default=str(Path(__file__).resolve().parents[1]), help="Repo root used for auto-discovery.")
    parser.add_argument("--dry-run", action="store_true", help="Print the planned patch without uploading or updating Supabase.")
    args = parser.parse_args(argv)

    client = RegistryClient(RegistryConfig.from_env())
    repo_root = Path(args.repo_root).expanduser().resolve()
    version = fetch_version(client, semver=args.semver, run_id=args.run_id)
    run_id = str(version.get("run_id") or args.run_id or "")
    if not run_id:
        raise SystemExit("Version is not linked to a run; provide a run-linked version.")
    run = fetch_run(client, run_id)
    weights = resolve_weights_path(repo_root, run, args.weights)
    semver = str(version["semver"])

    if args.dry_run:
        print(
            json.dumps(
                {
                    "version_id": version.get("id"),
                    "semver": semver,
                    "run_id": run_id,
                    "weights": str(weights),
                    "would_upload_kind": "pytorch",
                    "would_patch": ["versions.pytorch_r2_key", "versions.metadata.artifacts.pytorch"],
                },
                indent=2,
            )
        )
        return 0

    artifact = client.upload_artifact(
        weights,
        kind="pytorch",
        run_id=run_id,
        semver=semver,
        content_type="application/octet-stream",
    )
    metadata = patched_metadata(version, artifact)
    client._json(
        "PATCH",
        f"/rest/v1/versions?id=eq.{_query_value(str(version['id']))}",
        {"pytorch_r2_key": artifact.r2_key, "metadata": metadata},
    )
    append_run_log(client, run, f"Backfilled Local QA PyTorch artifact: {artifact.r2_key}")
    print(f"Backfilled {semver}: {artifact.r2_key}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
