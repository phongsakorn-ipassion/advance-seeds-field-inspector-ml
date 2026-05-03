from __future__ import annotations

import hashlib
import json
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Iterable

import yaml

from advance_seeds_training_worker.callbacks import CallbackClient, HttpTransport, urllib_transport


CommandRunner = Callable[[list[str], Path], Iterable[str]]


@dataclass(frozen=True)
class WorkerConfig:
    registry_url: str
    service_role_key: str
    repo_root: Path
    transport: HttpTransport | None = None


class HostedTrainingWorker:
    def __init__(
        self,
        config: WorkerConfig,
        *,
        command_runner: CommandRunner | None = None,
    ):
        self.config = config
        self.command_runner = command_runner or stream_subprocess

    def run(
        self,
        *,
        run_id: str,
        config: dict[str, Any],
        callback_url: str,
        callback_secret: str,
    ) -> dict[str, Any]:
        callback = CallbackClient(callback_url, callback_secret, transport=self.config.transport)
        semver = str(config.get("semver") or f"0.1.{run_id[:8]}")
        final_metrics: dict[str, float] = {}
        try:
            with tempfile.TemporaryDirectory(prefix="advance-seeds-worker-") as tmp:
                workdir = Path(tmp)
                train_config = self._write_training_config(config, workdir)
                callback.log(run_id=run_id, lines=[f"Worker prepared config at {train_config}"])
                command = [
                    sys.executable,
                    str(self.config.repo_root / "scripts" / "train_yolo26n_seg.py"),
                    "--config",
                    str(train_config),
                    "--no-auto-hardware",
                ]
                for line in self.command_runner(command, self.config.repo_root):
                    line = line.rstrip()
                    if not line:
                        continue
                    callback.log(run_id=run_id, lines=[line])
                    metric = parse_metric_line(line)
                    if metric is not None:
                        final_metrics[metric["name"]] = metric["value"]
                        callback.metric(run_id=run_id, **metric)

                artifacts = resolve_artifact_paths(config, workdir)
                uploaded_tflite = upload_artifact(
                    registry_url=self.config.registry_url,
                    service_role_key=self.config.service_role_key,
                    run_id=run_id,
                    semver=semver,
                    path=artifacts["tflite"],
                    kind="tflite",
                    transport=self.config.transport,
                )
                uploaded_coreml = upload_artifact(
                    registry_url=self.config.registry_url,
                    service_role_key=self.config.service_role_key,
                    run_id=run_id,
                    semver=semver,
                    path=artifacts["coreml"],
                    kind="coreml",
                    transport=self.config.transport,
                )
                callback.succeeded(
                    run_id=run_id,
                    semver=semver,
                    metrics=final_metrics,
                    **uploaded_tflite,
                    **uploaded_coreml,
                )
                return {"run_id": run_id, "semver": semver, **uploaded_tflite, **uploaded_coreml, "metrics": final_metrics}
        except Exception as exc:
            callback.failed(run_id=run_id, error=str(exc))
            raise

    def _write_training_config(self, config: dict[str, Any], workdir: Path) -> Path:
        dataset = materialize_dataset(config, workdir)
        hp = dict(config.get("hyperparameters") or {})
        train_config = {
            "model": config.get("source_weights") or config.get("sourceWeights") or "yolo26n-seg.pt",
            "data": str(dataset),
            "project": str(workdir / "runs"),
            "name": config.get("name") or "hosted-run",
            "epochs": int(hp.get("epochs", 1)),
            "imgsz": int(hp.get("imgsz", 640)),
            "batch": hp.get("batch", "auto"),
            "patience": int(hp.get("patience", 10)),
            "lr0": float(hp.get("lr0", 0.001)),
            "lrf": float(hp.get("lrf", 0.01)),
            "mosaic": float(hp.get("mosaic", 0.0)),
            "mixup": float(hp.get("mixup", 0.0)),
            "copy_paste": float(hp.get("copyPaste", hp.get("copy_paste", 0.0))),
        }
        target = workdir / "train.yaml"
        target.write_text(yaml.safe_dump(train_config, sort_keys=False), encoding="utf-8")
        return target


def materialize_dataset(config: dict[str, Any], workdir: Path) -> Path:
    dataset_url = config.get("dataset_url") or config.get("datasetUrl")
    dataset = config.get("dataset")
    if dataset_url:
        target = workdir / "dataset.yaml"
        download(str(dataset_url), target)
        return target
    if isinstance(dataset, str) and dataset.startswith(("http://", "https://")):
        target = workdir / "dataset.yaml"
        download(dataset, target)
        return target
    if isinstance(dataset, str):
        return Path(dataset)
    raise ValueError("config.dataset or config.dataset_url is required")


def resolve_artifact_paths(config: dict[str, Any], workdir: Path) -> dict[str, Path]:
    explicit = config.get("artifact_path") or config.get("artifactPath")
    explicit_coreml = config.get("coreml_artifact_path") or config.get("coremlArtifactPath")
    tflite = Path(str(explicit)) if explicit else latest_matching(workdir / "runs", "*.tflite")
    coreml = Path(str(explicit_coreml)) if explicit_coreml else (
        latest_matching(workdir / "runs", "*.mlpackage") or latest_matching(workdir / "runs", "*.mlmodel")
    )
    if tflite and not tflite.is_absolute():
        tflite = workdir / tflite
    if coreml and not coreml.is_absolute():
        coreml = workdir / coreml
    if not tflite:
        raise FileNotFoundError("training completed but no .tflite artifact was found")
    if not coreml:
        raise FileNotFoundError("training completed but no Core ML artifact was found")
    return {"tflite": tflite, "coreml": coreml}


def latest_matching(root: Path, pattern: str) -> Path | None:
    candidates = sorted(root.glob(f"**/{pattern}"), key=lambda p: p.stat().st_mtime, reverse=True)
    return candidates[0] if candidates else None


def parse_metric_line(line: str) -> dict[str, Any] | None:
    match = re.search(r"epoch[=/:\s]+(?P<epoch>\d+).*?(?:mAP50|map50)[=:\s]+(?P<map50>\d+(?:\.\d+)?)", line, re.I)
    if match:
        epoch = int(match.group("epoch"))
        return {"step": epoch, "epoch": epoch, "name": "mAP50", "value": float(match.group("map50"))}
    progress = re.search(r"progress[=:\s]+(?P<progress>\d+(?:\.\d+)?)", line, re.I)
    if progress:
        value = float(progress.group("progress"))
        return {"step": int(value), "epoch": None, "name": "progress", "value": value}
    return None


def upload_artifact(
    *,
    registry_url: str,
    service_role_key: str,
    run_id: str,
    semver: str,
    path: Path,
    kind: str,
    transport: HttpTransport | None = None,
) -> dict[str, Any]:
    cleanup: tempfile.TemporaryDirectory[str] | None = None
    upload_path = path
    if path.is_dir():
        cleanup = tempfile.TemporaryDirectory(prefix="advance-seeds-worker-artifact-")
        upload_path = Path(shutil.make_archive(str(Path(cleanup.name) / path.name), "zip", path))
    data = upload_path.read_bytes()
    content_hash = f"sha256:{hashlib.sha256(data).hexdigest()}"
    http = transport or urllib_transport
    headers = {
        "authorization": f"Bearer {service_role_key}",
        "apikey": service_role_key,
        "content-type": "application/json",
    }
    sign_body = json.dumps(
        {
            "kind": kind,
            "run_id": run_id,
            "semver": semver,
            "content_type": "application/zip" if kind == "coreml" and path.is_dir() else "application/octet-stream",
        }
    ).encode("utf-8")
    signed = http("POST", f"{registry_url.rstrip('/')}/functions/v1/upload-artifact", headers, sign_body)
    if not isinstance(signed, dict):
        raise RuntimeError("upload-artifact returned a non-object response")
    http(
        "PUT",
        str(signed["upload_url"]),
        {"content-type": "application/zip" if kind == "coreml" and path.is_dir() else "application/octet-stream", "content-length": str(len(data))},
        data,
    )
    result = {
        "tflite_r2_key" if kind == "tflite" else "mlmodel_r2_key": str(signed["r2_key"]),
        "size_bytes" if kind == "tflite" else "mlmodel_size_bytes": len(data),
        "content_hash" if kind == "tflite" else "mlmodel_content_hash": content_hash,
    }
    if cleanup is not None:
        cleanup.cleanup()
    return result


def download(url: str, target: Path) -> None:
    with urllib.request.urlopen(url) as response:
        target.write_bytes(response.read())


def stream_subprocess(command: list[str], cwd: Path) -> Iterable[str]:
    with subprocess.Popen(
        command,
        cwd=str(cwd),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    ) as proc:
        assert proc.stdout is not None
        for line in proc.stdout:
            yield line
        code = proc.wait()
    if code != 0:
        raise RuntimeError(f"training command failed with exit code {code}")
