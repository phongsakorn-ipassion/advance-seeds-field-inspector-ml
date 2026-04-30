# Tasks — Select YOLO26n-seg

## 1. Contract Updates

- [x] 1.1 Update metadata contract defaults to `yolo26n-seg.pt`.
- [x] 1.2 Add explicit `source_weights` and app-compatible TFLite filename fields.
- [x] 1.3 Use `end2end_nms_free` as the default export output kind.

## 2. Documentation And Specs

- [x] 2.1 Update README and handoff docs for YOLO26n-seg.
- [x] 2.2 Update OpenSpec config and canonical specs.
- [x] 2.3 Add OpenSpec deltas for the YOLO26n decision.

## 3. Validation

- [x] 3.1 Run unit tests.
- [x] 3.2 Run metadata generation smoke test.
- [x] 3.3 Run `openspec validate --all --strict`.
