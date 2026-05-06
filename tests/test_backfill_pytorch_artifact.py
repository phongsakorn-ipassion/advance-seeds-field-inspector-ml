import importlib.util
import tempfile
import unittest
from pathlib import Path


def load_backfill_script():
    script_path = Path(__file__).resolve().parents[1] / "scripts" / "backfill_pytorch_artifact.py"
    spec = importlib.util.spec_from_file_location("backfill_pytorch_artifact", script_path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


class BackfillPytorchArtifactTests(unittest.TestCase):
    def setUp(self):
        self.module = load_backfill_script()

    def test_resolve_weights_path_prefers_run_name_best(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            target = repo / "runs" / "data-20260506105130" / "weights"
            target.mkdir(parents=True)
            (target / "best.pt").write_bytes(b"best")

            resolved = self.module.resolve_weights_path(
                repo,
                {"id": "run-1", "config_yaml": {"name": "data-20260506105130"}},
                None,
            )

        self.assertEqual(resolved.name, "best.pt")

    def test_resolve_weights_path_does_not_pick_unrelated_weights(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            unrelated = repo / "runs" / "banana-v1" / "weights"
            unrelated.mkdir(parents=True)
            (unrelated / "best.pt").write_bytes(b"wrong")

            with self.assertRaises(SystemExit):
                self.module.resolve_weights_path(
                    repo,
                    {"id": "394a0834-ef3e-40e8-8fe9-fc38b31547cd", "config_yaml": {"name": "data-20260506105130"}},
                    None,
                )

    def test_patched_metadata_records_backfilled_fp32_artifact(self):
        artifact = type(
            "Artifact",
            (),
            {"r2_key": "runs/run-1/1.0.0.pt", "size_bytes": 12, "content_hash": "sha256:abc"},
        )()

        metadata = self.module.patched_metadata({"metadata": {"artifacts": {"tflite": {"r2_key": "old"}}}}, artifact)

        self.assertEqual(metadata["artifacts"]["tflite"]["r2_key"], "old")
        self.assertEqual(metadata["artifacts"]["pytorch"]["r2_key"], "runs/run-1/1.0.0.pt")
        self.assertEqual(metadata["artifacts"]["pytorch"]["quantization"]["precision"], "fp32")
        self.assertEqual(metadata["artifacts"]["pytorch"]["quantization"]["method"], "none")


if __name__ == "__main__":
    unittest.main()
