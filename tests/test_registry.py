import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from advance_seeds_ml.registry import RegistryClient, RegistryConfig, RegistryConfigError


class RecordingTransport:
    def __init__(self, responses):
        self.responses = list(responses)
        self.requests = []

    def __call__(self, method, url, headers, body):
        self.requests.append(
            {
                "method": method,
                "url": url,
                "headers": dict(headers),
                "body": body,
            }
        )
        if not self.responses:
            raise AssertionError(f"unexpected request: {method} {url}")
        return self.responses.pop(0)


class RegistryConfigTests(unittest.TestCase):
    def test_config_from_env_requires_url_and_service_role_key(self):
        with self.assertRaisesRegex(RegistryConfigError, "MODEL_REGISTRY_SERVICE_ROLE_KEY"):
            RegistryConfig.from_env({"MODEL_REGISTRY_URL": "http://127.0.0.1:54321"})

    def test_config_from_env_normalizes_url(self):
        config = RegistryConfig.from_env(
            {
                "MODEL_REGISTRY_URL": "http://127.0.0.1:54321/",
                "MODEL_REGISTRY_SERVICE_ROLE_KEY": "service-key",
            }
        )
        self.assertEqual(config.url, "http://127.0.0.1:54321")
        self.assertEqual(config.service_role_key, "service-key")


class RegistryClientTests(unittest.TestCase):
    def test_create_run_posts_to_supabase_runs_endpoint(self):
        transport = RecordingTransport([{"id": "run-1"}])
        client = RegistryClient(
            RegistryConfig("http://registry.local", "service-key"),
            transport=transport,
        )

        created = client.create_run(
            model_line_id="line-1",
            config_yaml={"epochs": 3},
            git_sha="abc123",
            host="banana",
            hardware={"kind": "cuda"},
        )

        self.assertEqual(created["id"], "run-1")
        request = transport.requests[0]
        self.assertEqual(request["method"], "POST")
        self.assertEqual(request["url"], "http://registry.local/rest/v1/runs?select=*")
        self.assertEqual(request["headers"]["authorization"], "Bearer service-key")
        self.assertEqual(request["headers"]["apikey"], "service-key")
        self.assertEqual(request["headers"]["prefer"], "return=representation")
        body = json.loads(request["body"].decode("utf-8"))
        self.assertEqual(body["model_line_id"], "line-1")
        self.assertEqual(body["status"], "running")
        self.assertEqual(body["config_yaml"], {"epochs": 3})
        self.assertEqual(body["git_sha"], "abc123")
        self.assertEqual(body["host"], "banana")
        self.assertEqual(body["hardware"], {"kind": "cuda"})

    def test_log_metrics_bulk_inserts_rows_with_run_id(self):
        transport = RecordingTransport([[]])
        client = RegistryClient(RegistryConfig("http://registry.local", "service-key"), transport=transport)

        client.log_metrics(
            "run-1",
            [
                {"step": 1, "epoch": 1, "name": "train/loss", "value": 1.25},
                {"step": 1, "epoch": 1, "name": "metrics/mAP50", "value": 0.81},
            ],
        )

        request = transport.requests[0]
        self.assertEqual(request["method"], "POST")
        self.assertEqual(request["url"], "http://registry.local/rest/v1/run_metrics")
        body = json.loads(request["body"].decode("utf-8"))
        self.assertEqual(body[0]["run_id"], "run-1")
        self.assertEqual(body[0]["name"], "train/loss")
        self.assertEqual(body[1]["value"], 0.81)

    def test_finalize_run_patches_status_and_finished_at(self):
        transport = RecordingTransport([[]])
        client = RegistryClient(RegistryConfig("http://registry.local", "service-key"), transport=transport)

        client.finalize_run("run-1", "succeeded")

        request = transport.requests[0]
        self.assertEqual(request["method"], "PATCH")
        self.assertEqual(request["url"], "http://registry.local/rest/v1/runs?id=eq.run-1")
        body = json.loads(request["body"].decode("utf-8"))
        self.assertEqual(body["status"], "succeeded")
        self.assertIn("finished_at", body)

    def test_upload_artifact_requests_signed_url_and_puts_file_bytes(self):
        transport = RecordingTransport(
            [
                {
                    "upload_url": "https://r2.example/upload?X-Amz-Signature=abc",
                    "r2_key": "runs/run-1/1.0.0.tflite",
                },
                {},
            ]
        )
        client = RegistryClient(RegistryConfig("http://registry.local", "service-key"), transport=transport)
        with tempfile.TemporaryDirectory() as tmp:
            artifact = Path(tmp) / "model.tflite"
            artifact.write_bytes(b"model-bytes")

            uploaded = client.upload_artifact(artifact, kind="tflite", run_id="run-1", semver="1.0.0")

        self.assertEqual(uploaded.r2_key, "runs/run-1/1.0.0.tflite")
        self.assertEqual(uploaded.size_bytes, 11)
        self.assertEqual(
            uploaded.content_hash,
            "sha256:357e5d6fafa34d27360fec24b4326d3534905e33c6acdee60198fb078b7b79e5",
        )
        sign_request, put_request = transport.requests
        self.assertEqual(sign_request["method"], "POST")
        self.assertEqual(sign_request["url"], "http://registry.local/functions/v1/upload-artifact")
        self.assertEqual(
            json.loads(sign_request["body"].decode("utf-8")),
            {"kind": "tflite", "run_id": "run-1", "semver": "1.0.0", "content_type": "application/octet-stream"},
        )
        self.assertEqual(put_request["method"], "PUT")
        self.assertEqual(put_request["url"], "https://r2.example/upload?X-Amz-Signature=abc")
        self.assertEqual(put_request["body"], b"model-bytes")

    def test_create_version_posts_metadata_and_artifact_details(self):
        transport = RecordingTransport([[{"id": "version-1"}]])
        client = RegistryClient(RegistryConfig("http://registry.local", "service-key"), transport=transport)

        version = client.create_version(
            run_id="run-1",
            model_line_id="line-1",
            semver="1.0.0",
            metadata={"class_names": ["banana"], "input_size": 640, "output_kind": "end2end_nms_free", "task": "segment"},
            tflite_r2_key="runs/run-1/1.0.0.tflite",
            size_bytes=11,
            content_hash="sha256:abc",
        )

        self.assertEqual(version["id"], "version-1")
        request = transport.requests[0]
        self.assertEqual(request["method"], "POST")
        self.assertEqual(request["url"], "http://registry.local/rest/v1/versions?select=*")
        body = json.loads(request["body"].decode("utf-8"))
        self.assertEqual(body["run_id"], "run-1")
        self.assertEqual(body["semver"], "1.0.0")
        self.assertEqual(body["metadata"]["class_names"], ["banana"])
        self.assertEqual(body["tflite_r2_key"], "runs/run-1/1.0.0.tflite")
        self.assertEqual(body["size_bytes"], 11)
        self.assertEqual(body["content_hash"], "sha256:abc")


if __name__ == "__main__":
    unittest.main()
