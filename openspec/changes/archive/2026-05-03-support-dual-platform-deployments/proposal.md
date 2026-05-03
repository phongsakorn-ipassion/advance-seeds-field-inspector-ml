## Why

The dashboard currently deploys one model version per channel and mobile
consumers resolve only that single pointer. The mobile app needs to list and
select deployed segmentation engines per channel, while keeping native runtime
boundaries clear: Android consumes TF Lite and iOS consumes Core ML.

Training also registers mostly Android-ready versions today. A deployable
version should package both platform artifacts when export succeeds, and the
dashboard should make platform readiness visible before and after deployment.

## What Changes

- Export and register both TF Lite and Core ML artifacts from the training
  flow. Core ML packages are uploaded to R2 as a zip object.
- Extend hosted-worker success callbacks to carry the optional Core ML R2 key.
- Add a `channel_deployments` table so staging and production can each contain
  multiple active deployed versions while preserving `channels.current_version_id`
  as the default pointer.
- Add a mobile-facing list endpoint that returns deployed model versions for a
  channel and platform, with signed URLs for the matching artifact type.
- Update the dashboard lifecycle UI from a single-pointer-only deploy model to
  show deployment readiness, deployed membership, default channel state, and
  archive/delete guards for deployed versions.
- Ensure storage deletion/archive removes both TF Lite and Core ML artifacts.

## Non-goals

- Dataset bundle upload remains out of scope.
- iOS Core ML runtime integration in the mobile app is out of scope for this
  repo; this change exposes the correct registry contract for it.
- No automatic rollback policy beyond recording deployment history and keeping
  existing channel defaults.
