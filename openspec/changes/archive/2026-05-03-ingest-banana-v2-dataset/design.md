# Design — Ingest Banana v2 Dataset

The existing banana ingestion path already remaps the two Roboflow classes into
the canonical six-class contract. Banana-v2 keeps the same source class ids, so
the implementation only needs new default paths and configs.

Local training should use `configs/train.banana-v2.yaml` by default. The v1
config remains available for reproducing previous runs.
