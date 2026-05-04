## 1. Spec

- [x] 1.1 Add OpenSpec proposal, design, and requirements for dataset bundle upload.

## 2. Dashboard

- [x] 2.1 Extend training config/store types with dataset bundle metadata.
- [x] 2.2 Add ZIP upload UI in Train new model.
- [x] 2.3 Store dataset bundle metadata when creating a run.

## 3. Colab and Trainer

- [x] 3.1 Download and unzip dataset bundles in `scripts/train_for_run.py` before dataset path materialization.
- [x] 3.2 Update the Colab notebook/manual hand-off copy to prefer dashboard-uploaded bundles and keep Drive unzip as fallback.
- [x] 3.3 Delete uploaded dataset ZIP bundles from R2 when training reaches a terminal status.

## 4. Validation

- [x] 4.1 Add or update focused tests for bundle extraction/path handling.
- [x] 4.2 Run web build, Python tests, Deno checks, and OpenSpec validation.
