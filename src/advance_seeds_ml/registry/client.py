from __future__ import annotations

import hashlib
import json
import mimetypes
import os
import shutil
import tempfile
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Callable
from urllib import request as urllib_request


Json = dict[str, Any] | list[Any]
Transport = Callable[[str, str, dict[str, str], bytes | None], Any]


class RegistryError(RuntimeError):
    """Base error for registry SDK failures."""


class RegistryConfigError(RegistryError):
    """Raised when registry SDK configuration is missing or invalid."""


@dataclass(frozen=True)
class RegistryConfig:
    url: str
    service_role_key: str

    @classmethod
    def from_env(cls, env: dict[str, str] | None = None) -> "RegistryConfig":
        source = os.environ if env is None else env
        missing = [
            key
            for key in ("MODEL_REGISTRY_URL", "MODEL_REGISTRY_SERVICE_ROLE_KEY")
            if not str(source.get(key, "")).strip()
        ]
        if missing:
            raise RegistryConfigError(f"missing registry settings: {', '.join(missing)}")
        return cls(
            url=str(source["MODEL_REGISTRY_URL"]).rstrip("/"),
            service_role_key=str(source["MODEL_REGISTRY_SERVICE_ROLE_KEY"]),
        )


@dataclass(frozen=True)
class UploadedArtifact:
    r2_key: str
    size_bytes: int
    content_hash: str


class RegistryClient:
    def __init__(self, config: RegistryConfig, transport: Transport | None = None):
        self.config = config
        self._transport = transport or urllib_transport

    def create_run(
        self,
        *,
        model_line_id: str,
        config_yaml: dict[str, Any],
        git_sha: str | None = None,
        host: str | None = None,
        hardware: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "model_line_id": model_line_id,
            "status": "running",
            "config_yaml": config_yaml,
        }
        optional = {
            "git_sha": git_sha,
            "host": host,
            "hardware": hardware,
        }
        payload.update({key: value for key, value in optional.items() if value is not None})
        result = self._json("POST", "/rest/v1/runs?select=*", payload, prefer_return=True)
        return _first_row(result)

    def log_metrics(self, run_id: str, metrics: list[dict[str, Any]]) -> None:
        rows = [dict(metric, run_id=run_id) for metric in metrics]
        self._json("POST", "/rest/v1/run_metrics", rows)

    def finalize_run(self, run_id: str, status: str) -> None:
        self._json(
            "PATCH",
            f"/rest/v1/runs?id=eq.{run_id}",
            {
                "status": status,
                "finished_at": datetime.now(UTC).isoformat(),
            },
        )

    def delete_dataset_bundle(self, r2_key: str) -> None:
        self._json("POST", "/functions/v1/delete-dataset", {"r2_key": r2_key})

    def upload_artifact(
        self,
        path: str | Path,
        *,
        kind: str,
        run_id: str,
        semver: str,
        content_type: str | None = None,
    ) -> UploadedArtifact:
        artifact_path = Path(path)
        cleanup: tempfile.TemporaryDirectory[str] | None = None
        if artifact_path.is_dir():
            cleanup = tempfile.TemporaryDirectory(prefix="advance-seeds-artifact-")
            archive_base = Path(cleanup.name) / artifact_path.name
            artifact_path = Path(shutil.make_archive(str(archive_base), "zip", artifact_path))
        data = artifact_path.read_bytes()
        resolved_content_type = content_type or mimetypes.guess_type(artifact_path.name)[0] or "application/octet-stream"
        sign_response = self._json(
            "POST",
            "/functions/v1/upload-artifact",
            {
                "kind": kind,
                "run_id": run_id,
                "semver": semver,
                "content_type": resolved_content_type,
            },
        )
        if not isinstance(sign_response, dict):
            raise RegistryError("upload-artifact returned a non-object response")
        upload_url = str(sign_response["upload_url"])
        r2_key = str(sign_response["r2_key"])
        self._request(
            "PUT",
            upload_url,
            {
                "content-type": resolved_content_type,
                "content-length": str(len(data)),
            },
            data,
            absolute_url=True,
        )
        uploaded = UploadedArtifact(
            r2_key=r2_key,
            size_bytes=len(data),
            content_hash=f"sha256:{hashlib.sha256(data).hexdigest()}",
        )
        if cleanup is not None:
            cleanup.cleanup()
        return uploaded

    def create_version(
        self,
        *,
        run_id: str | None,
        model_line_id: str,
        semver: str,
        metadata: dict[str, Any],
        tflite_r2_key: str | None = None,
        mlmodel_r2_key: str | None = None,
        size_bytes: int,
        content_hash: str,
    ) -> dict[str, Any]:
        payload = {
            "run_id": run_id,
            "model_line_id": model_line_id,
            "semver": semver,
            "metadata": metadata,
            "tflite_r2_key": tflite_r2_key,
            "mlmodel_r2_key": mlmodel_r2_key,
            "size_bytes": size_bytes,
            "content_hash": content_hash,
        }
        result = self._json("POST", "/rest/v1/versions?select=*", payload, prefer_return=True)
        return _first_row(result)

    def _json(self, method: str, path: str, payload: Json, *, prefer_return: bool = False) -> Any:
        headers = {
            "content-type": "application/json",
        }
        if prefer_return:
            headers["prefer"] = "return=representation"
        body = json.dumps(payload).encode("utf-8")
        response = self._request(method, path, headers, body)
        return response

    def _request(
        self,
        method: str,
        path: str,
        headers: dict[str, str],
        body: bytes | None,
        *,
        absolute_url: bool = False,
    ) -> Any:
        request_headers = dict(headers)
        if not absolute_url:
            request_headers.setdefault("apikey", self.config.service_role_key)
            request_headers.setdefault("authorization", f"Bearer {self.config.service_role_key}")
        url = path if absolute_url else f"{self.config.url}{path}"
        return self._transport(method, url, request_headers, body)


def urllib_transport(method: str, url: str, headers: dict[str, str], body: bytes | None) -> Any:
    req = urllib_request.Request(url, data=body, headers=headers, method=method)
    with urllib_request.urlopen(req) as response:
        data = response.read()
        if not data:
            return {}
        return json.loads(data.decode("utf-8"))


def _first_row(response: Any) -> dict[str, Any]:
    if isinstance(response, list):
        if not response:
            raise RegistryError("registry returned no rows")
        first = response[0]
        if isinstance(first, dict):
            return first
    if isinstance(response, dict):
        return response
    raise RegistryError("registry returned an unexpected response shape")
