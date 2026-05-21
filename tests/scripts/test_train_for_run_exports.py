import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))

from train_for_run import load_export_options


def test_defaults_when_missing():
    opts = load_export_options({})
    assert opts == {"ios": {"quantize": True}, "android": {"quantize": True}}


def test_reads_export_options_from_config():
    cfg = {"exportOptions": {"ios": {"quantize": False}, "android": {"quantize": True}}}
    opts = load_export_options(cfg)
    assert opts["ios"]["quantize"] is False
    assert opts["android"]["quantize"] is True


def test_reads_snake_case_export_options_from_config():
    cfg = {"export_options": {"ios": {"quantize": False}, "android": {"quantize": False}}}
    opts = load_export_options(cfg)
    assert opts["ios"]["quantize"] is False
    assert opts["android"]["quantize"] is False


def test_legacy_run_uses_defaults():
    cfg = {"hyperparameters": {"epochs": 10}}
    opts = load_export_options(cfg)
    assert opts["ios"]["quantize"] is True
    assert opts["android"]["quantize"] is True


def test_invalid_shape_falls_back_to_defaults():
    cfg = {"exportOptions": "not-a-dict"}
    opts = load_export_options(cfg)
    assert opts["ios"]["quantize"] is True


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
from train_for_run import platform_export_metadata


def test_artifact_metadata_handles_none_artifact():
    meta = artifact_metadata(
        kind="tflite",
        artifact=None,
        quantization={"precision": "fp32", "method": "none", "target": "tflite"},
    )
    assert meta["r2_key"] is None
    assert meta["size_bytes"] is None
    assert meta["content_hash"] is None
    assert meta["quantization"]["precision"] == "fp32"


def test_platform_export_metadata_exposes_export_choices_and_precision():
    meta = platform_export_metadata(
        {"ios": {"quantize": False}, "android": {"quantize": False}},
        {"precision": "fp32", "method": "none", "target": "tflite"},
        {"precision": "fp32", "method": "none", "target": "coreml"},
    )
    assert meta["android"]["artifact_kind"] == "tflite"
    assert meta["android"]["quantize"] is False
    assert meta["android"]["precision"] == "fp32"
    assert meta["ios"]["artifact_kind"] == "coreml"
    assert meta["ios"]["quantize"] is False


from train_for_run import export_kwargs


def test_export_kwargs_tflite_quantized():
    kw = export_kwargs("tflite", {"imgsz": 640, "data": "/x.yaml"}, quantize=True)
    assert kw["int8"] is True
    assert kw["data"] == "/x.yaml"


def test_export_kwargs_tflite_unquantized():
    kw = export_kwargs("tflite", {"imgsz": 640, "data": "/x.yaml"}, quantize=False)
    assert "int8" not in kw
    assert kw == {"format": "tflite", "imgsz": 640}


def test_export_kwargs_coreml_quantized():
    kw = export_kwargs("coreml", {"imgsz": 640}, quantize=True)
    assert kw["half"] is True


def test_export_kwargs_coreml_unquantized():
    kw = export_kwargs("coreml", {"imgsz": 640}, quantize=False)
    assert "half" not in kw
    assert kw == {"format": "coreml", "imgsz": 640}
