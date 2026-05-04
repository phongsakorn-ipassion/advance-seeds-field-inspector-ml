# Model Registry API Postman Guide

Import `docs/model-registry-postman-collection.json` into Postman to test the mobile-facing model registry services.

## Environment variables

Set these collection variables:

- `functions_base_url`: `https://gqsxiohxokgwwugeoxmy.supabase.co/functions/v1`
- `model_line`: model line slug, currently `seeds-poc`
- `channel`: `staging` or `production`
- `platform`: `android` or `ios`
- `current_version`: installed version id in the app, or blank for first install
- `current_compat`: installed compatibility signature, or blank if not installed

## Requests

### List selectable models

```http
GET {{functions_base_url}}/list-deployed-models?model_line={{model_line}}&channel={{channel}}&platform={{platform}}&ready_only=true
```

Use this for model picker screens. The response contains `models[]` with:

- `version_id`
- `semver`
- `platform`
- `is_default`
- `status`
- `artifact_kind`
- `artifact_url`
- `content_hash`
- `size_bytes`
- `compat_signature`
- `metadata`

### Resolve default model

```http
GET {{functions_base_url}}/resolve-channel?model_line={{model_line}}&channel={{channel}}&platform={{platform}}&current_version={{current_version}}&current_compat={{current_compat}}
```

Use this at app startup or sync time. Possible `action` values:

- `update`: download and activate `model_url`
- `noop`: keep the installed model
- `rebuild_required`: app/runtime compatibility changed
- `artifact_missing`: selected platform package is unavailable

For `update`, wire these response keys into the mobile app:

- `version_id`
- `semver`
- `platform`
- `artifact_kind`
- `model_url`
- `content_hash`
- `size_bytes`
- `metadata`

## Auth

These two endpoints are mobile-facing read endpoints. They do not require service-role credentials in the mobile app. The returned artifact URLs are short-lived signed R2 URLs.
