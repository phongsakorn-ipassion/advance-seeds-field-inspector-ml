#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_DIR="${VENV_DIR:-"$ROOT_DIR/.venv"}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
TRAIN_CONFIG="${TRAIN_CONFIG:-configs/train.banana-v2.yaml}"
DATASET_CONFIG="${DATASET_CONFIG:-configs/dataset.banana-v2.yaml}"
LOG_DIR="$ROOT_DIR/runs/logs"
LOG_FILE="$LOG_DIR/train-local-banana-$(date +%Y%m%d-%H%M%S).log"

cd "$ROOT_DIR"

if [[ ! -x "$VENV_DIR/bin/python" ]]; then
  echo "Creating virtual environment: $VENV_DIR"
  "$PYTHON_BIN" -m venv "$VENV_DIR"
fi

if ! "$VENV_DIR/bin/python" -c "import ultralytics" >/dev/null 2>&1; then
  echo "Installing training dependencies into: $VENV_DIR"
  "$VENV_DIR/bin/python" -m pip install -U pip
  "$VENV_DIR/bin/python" -m pip install -e '.[train]'
fi

echo "Validating dataset: $DATASET_CONFIG"
"$VENV_DIR/bin/python" scripts/validate_dataset.py "$DATASET_CONFIG"

mkdir -p "$LOG_DIR"
echo "Training log: $LOG_FILE"
echo "Starting YOLO26n-seg banana training..."

"$VENV_DIR/bin/python" scripts/train_yolo26n_seg.py --config "$TRAIN_CONFIG" "$@" 2>&1 | tee "$LOG_FILE"
exit "${PIPESTATUS[0]}"
