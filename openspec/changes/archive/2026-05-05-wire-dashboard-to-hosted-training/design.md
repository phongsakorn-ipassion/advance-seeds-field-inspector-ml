## Provider choice

Three serverless-GPU options were considered:

| Provider   | Cold-start | Pricing model       | Why it fits             | Risk                          |
|------------|------------|---------------------|-------------------------|-------------------------------|
| Modal      | ~5s        | Per-second GPU      | Python-native, $ cheap  | Smaller Thai/SEA POP          |
| Replicate  | ~10s       | Per-second + markup | Easiest API, model hub  | Locked to their conventions   |
| Beam       | ~3s        | Per-second GPU      | Fastest cold-start      | Smallest community            |

**Recommended default: Modal.** Reasons:
- The training script is already Python; Modal's `@modal.function` decorator
  wraps it with no rewrite.
- Per-second pricing is the cheapest of the three for short YOLO-n runs.
- Their HTTP webhooks fit the callback contract cleanly.

The `TRAINING_PROVIDER_BASE_URL` secret keeps the provider swappable; the
Edge Function speaks a tiny adapter shape rather than Modal-specific JSON.

## Architecture

```
Browser         start-training         Modal worker       training-callback     Supabase
─────────       ─────────────────      ─────────────      ──────────────────    ────────
admin clicks ──►POST /start-training
                 (run_id + config)
                ─INSERT runs row
                  (status=running,
                   provider_job=null)
                ─POST modal/runs ─────►
                                       fetch dataset
                                       (R2 presigned)
                                       train YOLO
                                       per-epoch     ────►POST /training-callback
                                       metrics + logs      verify HMAC
                                                          INSERT run_metrics  ────►runs/run_metrics
                                                          UPDATE runs.config_yaml
                                                            with appended logs
                                       on success    ────►POST /training-callback
                                       upload tflite       INSERT versions row
                                       to R2               UPDATE runs.status='succeeded'
                                                          UPDATE runs.finished_at
                                       on failure    ────►POST /training-callback
                                                          UPDATE runs.status='failed'
```

## Edge Functions

### `start-training`

Endpoint: `POST /functions/v1/start-training`
Auth: Supabase JWT, requires `app_metadata.role = "admin"`.
Body:

```json
{
  "model_line_slug": "seeds-poc",
  "config": { "dataset": "...", "source_weights": "...", ... }
}
```

Behavior:
1. Verify caller is admin (existing JWT helper).
2. Resolve `model_line_id` from slug.
3. INSERT `runs` row with `status='running'`, `config_yaml = config + bootstrap logs`.
4. POST to `${TRAINING_PROVIDER_BASE_URL}/runs` with `{ run_id, config, callback_url, callback_secret }`.
5. UPDATE the run with the returned `provider_job_id` and any presigned dataset URL the worker should pull.
6. Return `{ run_id, provider_job_id }`.

Response: 202 on success, 4xx on auth/validation, 5xx on provider failure
(with the run row's status set to `failed` so it does not stick at running).

### `training-callback`

Endpoint: `POST /functions/v1/training-callback`
Auth: HMAC-SHA256 over the body using `TRAINING_CALLBACK_SECRET`. Header
`X-Training-Signature: sha256=<hex>`.
Body (one of):

```json
{ "type": "metric", "run_id": "...", "step": 5, "epoch": 1, "name": "mAP50", "value": 0.62 }
{ "type": "log",    "run_id": "...", "lines": ["Epoch 1/50 ..."] }
{ "type": "succeeded", "run_id": "...", "tflite_r2_key": "...", "size_bytes": 12500000, "metrics": { ... } }
{ "type": "failed", "run_id": "...", "error": "..." }
```

Behavior:
- `metric` → INSERT `run_metrics`.
- `log` → append to `runs.config_yaml.logs` (last 500 lines).
- `succeeded` → INSERT `versions` row, UPDATE run status, link version to run.
- `failed` → UPDATE run status to failed and append error to logs.

The function uses the service role since it must write across multiple
tables and bypass RLS; HMAC is the security boundary.

## Worker

Python package `packages/training-worker/` exposing a single
`@modal.function` (or equivalent for the chosen provider). Inputs:
`run_id`, `config`, `callback_url`, `callback_secret`. Behavior:

1. Pull the dataset YAML and image tar from R2 (URLs in `config`).
2. Run `train_yolo26n_seg.py` against the local copy.
3. After each epoch, POST a `metric` callback with mAP50/mask_map.
4. Forward stdout to a `log` callback every ~5s (batched).
5. Upload the resulting `.tflite` (and `.mlmodel` if requested) to R2
   using the upload-artifact Edge Function's presigned PUT.
6. POST a `succeeded` callback with the R2 keys and final metrics, OR a
   `failed` callback with the exception text.

The worker container image bakes in `ultralytics`, `torch`, and the repo's
training script. Per-run dataset is fetched at runtime so the image stays
small.

## Dataset access

The worker is the new dependency boundary. Three options for dataset
delivery (the Edge Function picks based on `config.dataset_source`):

1. **R2 presigned GET (recommended)**: admin uploads the dataset zip to a
   well-known R2 key once; `start-training` issues a presigned URL valid
   for the run duration; worker pulls it.
2. **Public HTTPS URL**: dashboard accepts a URL field; worker downloads.
   Only used for public open datasets.
3. **Baked into worker image**: only for the PoC's banana-v2 dataset if it
   never changes. Cheapest, least flexible.

For the first iteration we ship (1) and document (2) as a future toggle.

## Security

- Browser → `start-training`: Supabase JWT, admin role required.
- `start-training` → provider: provider API key from Supabase secrets,
  never sent to the browser.
- Provider → `training-callback`: HMAC-SHA256 with shared secret, run id
  in body must match the provider job id stored on the run row.
- Worker → R2: presigned PUT URLs from `upload-artifact` (existing).

## Backward compatibility

The Python SDK path keeps working. The `runs` schema is unchanged except
for an additive `provider_job_id text` column on `runs`. Local-launched
runs simply leave `provider_job_id` null; their callbacks come from
`scripts/train_yolo26n_seg.py` writing directly with service role, as
today.

## Risks

- **Provider lock-in**: mitigated by keeping the Edge Function the only
  thing that talks to the provider.
- **Cold start vs realtime feel**: a 5-10s cold start before the first
  metric arrives. The dashboard's "Awaiting…" hint already handles this.
- **Cost surprises**: a runaway loop on the worker can rack up charges.
  Add a `max_epochs` ceiling and a per-run timeout in `start-training`.
- **Callback replay**: HMAC alone does not prevent replay. Include a
  `nonce` and a per-run idempotency key on the callback to drop dupes.
