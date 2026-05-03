from __future__ import annotations

import hashlib
import hmac
import json
from dataclasses import dataclass
from typing import Any, Callable
from urllib import request as urllib_request


CallbackEvent = dict[str, Any]
HttpTransport = Callable[[str, str, dict[str, str], bytes | None], Any]


@dataclass(frozen=True)
class CallbackClient:
    url: str
    secret: str
    transport: HttpTransport | None = None

    def post(self, event: CallbackEvent) -> None:
        body = json.dumps(event, separators=(",", ":"), sort_keys=True).encode("utf-8")
        signature = hmac.new(self.secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
        transport = self.transport or urllib_transport
        transport(
            "POST",
            self.url,
            {
                "content-type": "application/json",
                "x-training-signature": f"sha256={signature}",
            },
            body,
        )

    def metric(self, *, run_id: str, step: int, name: str, value: float, epoch: int | None = None) -> None:
        self.post(
            {
                "type": "metric",
                "run_id": run_id,
                "step": step,
                "epoch": epoch,
                "name": name,
                "value": float(value),
            }
        )

    def log(self, *, run_id: str, lines: list[str]) -> None:
        if lines:
            self.post({"type": "log", "run_id": run_id, "lines": lines})

    def succeeded(
        self,
        *,
        run_id: str,
        tflite_r2_key: str,
        mlmodel_r2_key: str | None = None,
        mlmodel_size_bytes: int | None = None,
        mlmodel_content_hash: str | None = None,
        size_bytes: int,
        content_hash: str,
        semver: str,
        metrics: dict[str, float] | None = None,
    ) -> None:
        self.post(
            {
                "type": "succeeded",
                "run_id": run_id,
                "tflite_r2_key": tflite_r2_key,
                "mlmodel_r2_key": mlmodel_r2_key,
                "mlmodel_size_bytes": mlmodel_size_bytes,
                "mlmodel_content_hash": mlmodel_content_hash,
                "size_bytes": size_bytes,
                "content_hash": content_hash,
                "semver": semver,
                "metrics": metrics or {},
            }
        )

    def failed(self, *, run_id: str, error: str) -> None:
        self.post({"type": "failed", "run_id": run_id, "error": error})


def urllib_transport(method: str, url: str, headers: dict[str, str], body: bytes | None) -> Any:
    req = urllib_request.Request(url, data=body, headers=headers, method=method)
    with urllib_request.urlopen(req) as response:
        data = response.read()
        if not data:
            return {}
        return json.loads(data.decode("utf-8"))
