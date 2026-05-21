import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))

from train_for_run import load_export_options


def test_defaults_when_missing():
    opts = load_export_options({})
    assert opts == {
        "ios": {"enabled": True, "precision": "fp16"},
        "android": {"enabled": True, "precision": "int8"},
    }


def test_reads_export_options_from_config():
    cfg = {
        "exportOptions": {
            "ios": {"enabled": False, "precision": "fp16"},
            "android": {"enabled": True, "precision": "int8"},
        }
    }
    opts = load_export_options(cfg)
    assert opts["ios"]["enabled"] is False
    assert opts["android"]["enabled"] is True


def test_legacy_run_uses_defaults():
    cfg = {"hyperparameters": {"epochs": 10}}
    opts = load_export_options(cfg)
    assert opts["ios"]["enabled"] is True
    assert opts["android"]["enabled"] is True


def test_invalid_shape_falls_back_to_defaults():
    cfg = {"exportOptions": "not-a-dict"}
    opts = load_export_options(cfg)
    assert opts["ios"]["enabled"] is True


from datetime import datetime
from train_for_run import build_structured_log_entry


def test_build_structured_log_entry_shape():
    entry = build_structured_log_entry(
        step=5, phase="export", status="ok", message="TFLite done"
    )
    assert entry["step"] == 5
    assert entry["phase"] == "export"
    assert entry["status"] == "ok"
    assert entry["message"] == "TFLite done"
    # ts must be ISO8601 UTC, ending in Z
    datetime.fromisoformat(entry["ts"].replace("Z", "+00:00"))


def test_build_structured_log_entry_step_none():
    entry = build_structured_log_entry(
        step=None, phase=None, status="info", message="free text"
    )
    assert entry["step"] is None
    assert entry["phase"] is None


from train_for_run import artifact_metadata


def test_artifact_metadata_handles_none_artifact():
    meta = artifact_metadata(
        kind="tflite",
        artifact=None,
        quantization={"precision": "skipped", "method": "none", "target": "tflite"},
    )
    assert meta["r2_key"] is None
    assert meta["size_bytes"] is None
    assert meta["content_hash"] is None
    assert meta["quantization"]["precision"] == "skipped"
