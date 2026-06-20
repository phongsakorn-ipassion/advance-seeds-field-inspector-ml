## Why

`upload-artifact` returns an R2 presigned PUT URL with the default TTL of **900 seconds (15 minutes)** — `presignPut` in `supabase/functions/_shared/r2.ts` is called with no explicit `expiresIn`. Model artifacts are tens of MB (TFLite int8, Core ML `.mlpackage.zip`, the PyTorch `.pt`). On a slow or interrupted uplink the PUT can outlive the URL and fail mid-transfer, forcing a full restart. The `model-registry` spec was recently corrected to document the 15-minute reality (drift D11) and left a review TODO flagging it as possibly too short.

## What Changes

- `upload-artifact` SHALL request a longer, explicit presigned PUT TTL (1 hour / 3600 s) sized for large artifact uploads, instead of relying on the 900 s default.
- Resolve the `model-registry` spec's review TODO by setting the documented PUT TTL to one hour.

Non-goals:

- Do not change the download presign TTL (`download-artifact`/`list-deployed-models`/`resolve-channel`) — short-lived GET URLs are appropriate and unaffected.
- Do not change dataset upload TTL unless the same large-file argument applies (evaluate during implementation).
- Do not change R2 credentials, bucket, or CORS.

## Capabilities

### Modified Capabilities

- `model-registry`: the artifact-upload presigned PUT URL TTL is one hour (was documented as 15 minutes).

## Impact

- `supabase/functions/upload-artifact/index.ts` — pass an explicit `expiresIn = 3600` to `presignPut`.
- `supabase/functions/_shared/r2.ts` — optionally raise/parametrize the default if shared, but the targeted fix is at the call site.
- `openspec/specs/model-registry/spec.md` — TTL wording (15-minute → one-hour) and removal of the review TODO. (This supersedes the note added by the drift-sync change; coordinate ordering.)
- No schema, training, app, or dashboard changes.
