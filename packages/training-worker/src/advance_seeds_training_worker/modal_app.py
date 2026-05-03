from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from advance_seeds_training_worker.runner import HostedTrainingWorker, WorkerConfig

try:
    import modal
except ModuleNotFoundError:  # pragma: no cover - imported only in Modal.
    modal = None


def _build_app():
    if modal is None:
        return None

    worker_secret = modal.Secret.from_name("advance-seeds-training-worker")
    worker_image = (
        modal.Image.debian_slim(python_version="3.11")
        .pip_install("PyYAML>=6.0.1", "ultralytics>=8.3.0", "opencv-python-headless>=4.9.0", "numpy>=1.26", "coremltools>=8.0")
        .add_local_dir(
            Path(__file__).resolve().parents[4],
            remote_path="/workspace",
            ignore=[
                ".git/**",
                ".venv/**",
                ".worktrees/**",
                ".playwright-mcp/**",
                "apps/web/node_modules/**",
                "apps/web/dist/**",
                "data/**",
                "runs/**",
            ],
        )
    )
    api_image = modal.Image.debian_slim(python_version="3.11").pip_install("fastapi[standard]>=0.115.0")
    app = modal.App("advance-seeds-training-worker")

    @app.function(image=worker_image, gpu="T4", timeout=60 * 60, secrets=[worker_secret])
    def train(run_id: str, config: dict[str, Any], callback_url: str, callback_secret: str) -> dict[str, Any]:
        worker = HostedTrainingWorker(
            WorkerConfig(
                registry_url=os.environ["MODEL_REGISTRY_URL"],
                service_role_key=os.environ["MODEL_REGISTRY_SERVICE_ROLE_KEY"],
                repo_root=Path("/workspace"),
            )
        )
        return worker.run(run_id=run_id, config=config, callback_url=callback_url, callback_secret=callback_secret)

    @app.function(image=api_image, secrets=[worker_secret])
    @modal.concurrent(max_inputs=100)
    @modal.asgi_app()
    def api():
        import fastapi

        web_app = fastapi.FastAPI(title="Advance Seeds Training Provider")

        @web_app.get("/health")
        async def health() -> dict[str, bool]:
            return {"ok": True}

        @web_app.post("/runs")
        async def create_run(request: fastapi.Request) -> dict[str, str]:
            expected = os.environ.get("PROVIDER_API_KEY") or os.environ.get("TRAINING_PROVIDER_API_KEY")
            auth = request.headers.get("authorization", "")
            if not expected or auth != f"Bearer {expected}":
                raise fastapi.HTTPException(status_code=401, detail="invalid provider token")

            payload = await request.json()
            try:
                run_id = _string_field(payload, "run_id")
                config = _object_field(payload, "config")
                callback_url = _string_field(payload, "callback_url")
                callback_secret = _string_field(payload, "callback_secret")
            except ValueError as exc:
                raise fastapi.HTTPException(status_code=400, detail=str(exc)) from exc

            call = train.spawn(
                run_id=run_id,
                config=config,
                callback_url=callback_url,
                callback_secret=callback_secret,
            )
            return {"provider_job_id": call.object_id}

    return app


def _string_field(payload: Any, key: str) -> str:
    value = payload.get(key) if isinstance(payload, dict) else None
    if not isinstance(value, str) or not value:
        raise ValueError(f"{key} is required")
    return value


def _object_field(payload: Any, key: str) -> dict[str, Any]:
    value = payload.get(key) if isinstance(payload, dict) else None
    if not isinstance(value, dict):
        raise ValueError(f"{key} is required")
    return value


app = _build_app()
