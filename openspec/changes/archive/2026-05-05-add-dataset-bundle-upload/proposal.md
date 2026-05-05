## Why
Manual Colab training currently receives the dataset YAML from R2 but still requires operators to mount Google Drive or manually unzip images before training. This breaks the dashboard-to-Colab workflow and causes image-not-found failures when the YAML paths resolve but no image files exist in the runtime.

## What Changes
- Allow operators to upload a zipped dataset image bundle with the dataset YAML from the Train pipeline.
- Store the bundle R2 key and metadata on `runs.config_yaml`.
- Update Colab/trainer setup to download and unzip the bundle before Ultralytics resolves the dataset YAML.
- Keep manual Drive unzip as a fallback when no bundle is attached.

## Impact
- No service-role or R2 secrets are added to browser code.
- Uses existing admin-only Supabase Edge Functions for dataset R2 presigned URLs.
- Manual Colab remains the GPU execution path; this only removes the image handoff friction.
