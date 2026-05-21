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
