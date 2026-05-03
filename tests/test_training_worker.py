import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "packages" / "training-worker" / "src"))

from advance_seeds_training_worker.callbacks import CallbackClient
from advance_seeds_training_worker.runner import HostedTrainingWorker, WorkerConfig, parse_metric_line


RUN_ID = "00000000-0000-4000-8000-000000000001"


class RecordingTransport:
    def __init__(self):
        self.requests = []

    def __call__(self, method, url, headers, body):
        self.requests.append({"method": method, "url": url, "headers": dict(headers), "body": body})
        if method == "POST" and url.endswith("/functions/v1/upload-artifact"):
            payload = json.loads(body.decode("utf-8"))
            ext = "tflite" if payload["kind"] == "tflite" else "mlpackage.zip"
            return {"upload_url": f"https://r2.example/upload-{payload['kind']}", "r2_key": f"runs/{RUN_ID}/0.1.test.{ext}"}
        return {}


class TrainingWorkerTests(unittest.TestCase):
    def test_callback_client_posts_hmac_signed_event(self):
        transport = RecordingTransport()
        client = CallbackClient("https://registry.example/functions/v1/training-callback", "secret", transport=transport)

        client.metric(run_id=RUN_ID, step=1, epoch=1, name="mAP50", value=0.5)

        self.assertEqual(transport.requests[0]["method"], "POST")
        self.assertTrue(transport.requests[0]["headers"]["x-training-signature"].startswith("sha256="))
        self.assertEqual(json.loads(transport.requests[0]["body"].decode("utf-8"))["type"], "metric")

    def test_parse_metric_line_extracts_epoch_map50(self):
        self.assertEqual(
            parse_metric_line("epoch=2 mAP50=0.61 loss=1.2"),
            {"step": 2, "epoch": 2, "name": "mAP50", "value": 0.61},
        )

    def test_worker_streams_logs_metrics_uploads_artifact_and_succeeds(self):
        transport = RecordingTransport()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "scripts").mkdir()
            artifact = Path(tmp) / "model.tflite"
            artifact.write_bytes(b"model")
            coreml = Path(tmp) / "model.mlpackage"
            coreml.mkdir()
            (coreml / "Manifest.json").write_text("{}", encoding="utf-8")
            dataset = Path(tmp) / "dataset.yaml"
            dataset.write_text("path: .\ntrain: images\nval: images\nnames:\n  0: banana\n", encoding="utf-8")

            def fake_runner(command, cwd):
                self.assertEqual(cwd, root)
                self.assertIn("--config", command)
                yield "epoch=1 mAP50=0.42\n"
                yield "progress=100\n"

            worker = HostedTrainingWorker(
                WorkerConfig("https://registry.example", "service-key", root, transport=transport),
                command_runner=fake_runner,
            )
            result = worker.run(
                run_id=RUN_ID,
                config={
                    "dataset": str(dataset),
                    "source_weights": "yolo26n-seg.pt",
                    "hyperparameters": {"epochs": 1, "imgsz": 32},
                    "artifact_path": str(artifact),
                    "coreml_artifact_path": str(coreml),
                    "semver": "0.1.test",
                },
                callback_url="https://registry.example/functions/v1/training-callback",
                callback_secret="secret",
            )

        callback_events = [
            json.loads(req["body"].decode("utf-8"))
            for req in transport.requests
            if req["url"].endswith("/training-callback")
        ]
        self.assertIn("metric", [event["type"] for event in callback_events])
        self.assertEqual(callback_events[-1]["type"], "succeeded")
        self.assertEqual(callback_events[-1]["tflite_r2_key"], f"runs/{RUN_ID}/0.1.test.tflite")
        self.assertEqual(callback_events[-1]["mlmodel_r2_key"], f"runs/{RUN_ID}/0.1.test.mlpackage.zip")
        self.assertEqual(result["size_bytes"], 5)
        self.assertEqual([req["method"] for req in transport.requests if "r2.example" in req["url"]], ["PUT", "PUT"])

    def test_worker_reports_failed_event_when_training_raises(self):
        transport = RecordingTransport()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            dataset = Path(tmp) / "dataset.yaml"
            dataset.write_text("path: .\ntrain: images\nval: images\nnames:\n  0: banana\n", encoding="utf-8")

            def failing_runner(command, cwd):
                raise RuntimeError("boom")
                yield ""  # pragma: no cover

            worker = HostedTrainingWorker(
                WorkerConfig("https://registry.example", "service-key", root, transport=transport),
                command_runner=failing_runner,
            )
            with self.assertRaisesRegex(RuntimeError, "boom"):
                worker.run(
                    run_id=RUN_ID,
                    config={"dataset": str(dataset), "hyperparameters": {"epochs": 1}},
                    callback_url="https://registry.example/functions/v1/training-callback",
                    callback_secret="secret",
                )

        callback_events = [
            json.loads(req["body"].decode("utf-8"))
            for req in transport.requests
            if req["url"].endswith("/training-callback")
        ]
        self.assertEqual(callback_events[-1], {"error": "boom", "run_id": RUN_ID, "type": "failed"})


if __name__ == "__main__":
    unittest.main()
