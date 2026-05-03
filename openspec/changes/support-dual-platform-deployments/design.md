## Architecture

Deployment gains a second layer:

- `channels` remains the default pointer for each `(model_line, channel)`.
- `channel_deployments` records all active deployed versions for a channel.

This keeps backward compatibility for `resolve-channel` and adds a richer list
API for mobile apps that want a selectable model catalog.

## Artifact Contract

Each `versions` row remains the logical model package:

- `tflite_r2_key` is required and backs Android TF Lite.
- `mlmodel_r2_key` is optional and backs iOS Core ML. Core ML package
  directories are zipped before upload and stored as `.mlpackage.zip`.
- `size_bytes` remains the TF Lite size for compatibility; platform artifact
  sizes are additionally recorded in `metadata.artifacts`.
- `content_hash` remains the TF Lite hash for compatibility; Core ML hash is
  recorded in `metadata.artifacts.coreml.content_hash`.

## Training Flow

After training finishes:

1. Export TF Lite. This is required; failure fails the run.
2. Export Core ML. If export succeeds, zip package directories before upload.
3. Upload both artifacts through `upload-artifact`.
4. Create one `versions` row with both R2 keys and artifact metadata.

Core ML export failure is surfaced in run logs. The first implementation keeps
TF Lite as the minimum deployable Android artifact and marks iOS as missing
when Core ML is unavailable.

## Mobile API

`list-deployed-models` accepts:

```text
GET /functions/v1/list-deployed-models?model_line=seeds-poc&channel=production&platform=android
```

It returns active deployments, default status, metadata, hashes, and a
short-lived signed URL for the requested platform artifact. iOS entries without
Core ML are returned as `artifact_missing` unless the caller requests only
ready artifacts.

## Dashboard

Model detail shows platform readiness:

- Android TF Lite ready/missing.
- iOS Core ML ready/missing.
- Deployment membership in staging/production.
- A deployed version cannot be archived until removed from every deployment and
  no longer used as a channel default.

Deploy actions add the version to `channel_deployments` and optionally set it
as the default channel pointer. Undeploy removes it from the deployment set and
clears/moves the default pointer when needed.
