# Tasks — Ingest Banana v1 Dataset

## 1. Dataset Preparation

- [x] 1.1 Inspect downloaded Roboflow dataset structure and class ids.
- [x] 1.2 Add label remapping helpers for `0 -> 2` and `1 -> 3`.
- [x] 1.3 Add banana dataset preparation script.
- [x] 1.4 Add committed banana dataset config.

## 2. Tests And Specs

- [x] 2.1 Add unit tests for label remapping.
- [x] 2.2 Add OpenSpec change for the ingestion behavior.

## 3. Validation

- [x] 3.1 Run banana dataset preparation.
- [x] 3.2 Validate `configs/dataset.banana-v1.yaml`.
- [x] 3.3 Run unit tests.
- [x] 3.4 Run `openspec validate --all --strict`.
