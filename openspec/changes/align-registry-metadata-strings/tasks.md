## 1. Align registry metadata vocabulary

- [ ] 1.1 In `training-callback` (index.ts / callback.ts), set version metadata `output_kind: "segmentation"` (was `segmentation-mask`).
- [ ] 1.2 Set `task: "instance-segmentation"` (was `segmentation`).
- [ ] 1.3 Populate `model_name` from the run's source weights (strip `.pt`; default `yolo26n-seg`); validate against `/^yolo26[a-z0-9]+-seg$/`.
- [ ] 1.4 Update Edge Function tests/fixtures (`supabase/tests`, `_shared/model-metadata.test.ts`, `callback.test.ts`) to assert the new strings.

## 2. compat_signature cutover

- [ ] 2.1 Decide cutover strategy: accept that new versions get a new `compat_signature` (clients rebuild), OR backfill existing versions' signatures so old + new match.
- [ ] 2.2 Document the chosen approach in `docs/model-registry-handoff.md` and note the reference compat hash change.

## 3. Remove the app-side silent overwrite (cross-repo, coordinated)

- [ ] 3.1 In the demo repo, change `metadataFromDeployment` to pass wire `task`/`output_kind` through (no hardcode) and run `validateModelMetadata`.
- [ ] 3.2 Verify install + activate against a real deployment on device (iOS + Android).

## 4. Validate

- [ ] 4.1 `openspec validate align-registry-metadata-strings --strict`.
- [ ] 4.2 Edge Function tests pass; a deployed model installs on the app without the overwrite.
