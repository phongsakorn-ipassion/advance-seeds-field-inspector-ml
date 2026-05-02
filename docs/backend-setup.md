# Backend Setup — Model Registry

Local-first; cloud deploy is the last step.

## 1. Prerequisites

- macOS or Linux with Docker running
- `brew install supabase/tap/supabase deno`
- A Cloudflare account (free)

## 2. Cloudflare R2 bucket

1. Cloudflare dashboard → R2 → "Create bucket" → `advance-seeds-models`.
2. Create an API token: R2 → "Manage API tokens" → "Create API token"
   with read+write on the bucket. Save the access key id and secret.
3. Note your account id (R2 sidebar shows it).

## 3. Local stack

```bash
cp supabase/.env.example supabase/.env.local
# Fill R2_* values from step 2
supabase start
# Copy the printed anon key + service_role key into supabase/.env.local
supabase db reset
```

## 4. Run all backend tests

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -f supabase/tests/sql/schema.test.sql
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -f supabase/tests/sql/compat_signature.test.sql
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -f supabase/tests/sql/rls.test.sql
deno test supabase/functions/_shared/compat.test.ts --allow-net=false

# Edge functions: load fixture, serve, hit
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -f supabase/tests/fixtures/seed_run_v1.sql
supabase functions serve --env-file supabase/.env.local &
deno test supabase/functions --allow-net --allow-env
kill %1
```

## 5. Smoke test

```bash
source supabase/.env.local
curl "http://127.0.0.1:54321/functions/v1/resolve-channel?channel=staging&model_line=seeds-poc&current_compat=&current_version=" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "apikey: $SUPABASE_ANON_KEY"
```

Expected: JSON with `"action": "update"` and a presigned `model_url`.

## 6. Cloud deploy

1. `supabase login`
2. `supabase projects create advance-seeds-model-registry --region ap-southeast-1`
3. `supabase link --project-ref <ref>`
4. `supabase db push`
5. `supabase functions deploy resolve-channel`
6. `supabase functions deploy upload-artifact`
7. `supabase secrets set R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... R2_BUCKET=advance-seeds-models`
8. Add the same R2 secrets to GitHub repo settings → Secrets so the
   `backend` workflow can run edge function tests.

## 7. Promote a fixture version manually

```bash
psql "$DATABASE_URL" -c "
  UPDATE channels SET current_version_id =
    (SELECT id FROM versions WHERE semver='1.0.0' AND model_line_id =
       (SELECT id FROM model_lines WHERE slug='seeds-poc'))
  WHERE name = 'staging';
"
```
