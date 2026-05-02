# Backend Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Supabase + R2 backend that owns the model registry — schema, RLS, two Edge Functions — so that the Python SDK, web dashboard, and mobile app (planned separately) all have a working API to talk to.

**Architecture:** Supabase project (Postgres + Auth + Edge Functions) holds registry state and exposes the mobile-facing OTA endpoint. Cloudflare R2 holds artifact bytes; only Edge Functions ever mint signed URLs for it. Local development uses the Supabase CLI; deployment to cloud is a final manual phase.

**Tech Stack:** Supabase CLI, Postgres 15, PL/pgSQL, Deno (Edge Functions), pgcrypto, S3-compatible client (`@aws-sdk/client-s3`) for R2.

---

## Spec Reference

Implements §3 (Components — backend half), §4 (Data Model), §5 (Flows A/C/D server side), §6 (OTA Compatibility Rule) of `docs/superpowers/specs/2026-05-02-model-registry-web-app-design.md`.

## File Structure

```
supabase/
  config.toml                            # Supabase CLI config (generated, then pinned)
  .env.example                           # template for secrets
  migrations/
    20260502000001_model_lines.sql
    20260502000002_runs_and_metrics.sql
    20260502000003_versions.sql
    20260502000004_channels.sql
    20260502000005_rls.sql
    20260502000006_seed.sql              # seeds-poc model_line + admin role helpers
  functions/
    _shared/
      cors.ts                            # shared CORS headers
      r2.ts                              # R2 S3 client + signed URL helpers
      supabase.ts                        # service-role client factory
      compat.ts                          # compat_signature canonicalization (TS mirror of SQL)
    resolve-channel/
      index.ts
      index.test.ts
    upload-artifact/
      index.ts
      index.test.ts
  tests/
    sql/
      schema.test.sql                    # pgTAP-style assertions
      rls.test.sql
      compat_signature.test.sql
    fixtures/
      seed_run_v1.sql                    # one run, one version, channel pointers

.github/workflows/
  backend.yml                            # CI: spin up Supabase, run all backend tests

docs/
  backend-setup.md                       # operator guide: cloud deploy, R2 provisioning
```

## OpenSpec Governance

This plan introduces a new capability: `model-registry`. The OpenSpec change folder `openspec/changes/add-model-registry-backend/` is created in Task 0 and archived after Phase D completes.

---

## Phase A — Repository Prep

### Task A1: Add backend scaffolding skeleton + OpenSpec change folder

**Files:**
- Create: `supabase/.env.example`
- Create: `.gitignore` (modify)
- Create: `openspec/changes/add-model-registry-backend/proposal.md`
- Create: `openspec/changes/add-model-registry-backend/tasks.md`
- Create: `openspec/changes/add-model-registry-backend/design.md`
- Create: `openspec/changes/add-model-registry-backend/specs/model-registry/spec.md`

- [ ] **Step 1: Add ignore rules for Supabase artifacts**

Append to `.gitignore`:

```gitignore
# Supabase
supabase/.branches
supabase/.temp
supabase/.env
supabase/.env.local
**/.deno/
**/node_modules/
```

- [ ] **Step 2: Create `supabase/.env.example`**

```env
# Local development copies this to .env.local; production uses Supabase secrets.
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=<filled by `supabase start`>
SUPABASE_SERVICE_ROLE_KEY=<filled by `supabase start`>

R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=advance-seeds-models
R2_ENDPOINT=https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com
R2_PUBLIC_BASE=                          # optional CDN base; empty = always sign
```

- [ ] **Step 3: Create the OpenSpec change folder**

`openspec/changes/add-model-registry-backend/proposal.md`:

```markdown
# Proposal — Add Model Registry Backend

## Why

The mobile inspector app currently consumes models bundled at build time via
`scripts/export_to_demo.py`. To support staged rollouts, rollback, and
observability of training runs, we need a versioned registry the app can
poll over the air.

## What Changes

Introduces a new `model-registry` capability owned by a Supabase + Cloudflare
R2 backend: schema for runs/metrics/versions/channels, RLS, and two Edge
Functions (`resolve-channel`, `upload-artifact`).

## Impact

- New capability spec: `model-registry`.
- No changes to existing capabilities yet (the Python SDK and training-script
  hook arrive in a follow-up plan).
- New external dependencies: Supabase project, Cloudflare R2 bucket.
```

`openspec/changes/add-model-registry-backend/tasks.md`:

```markdown
# Tasks — Add Model Registry Backend

## 1. Schema And RLS

- [ ] 1.1 Add migrations for `model_lines`, `runs`, `run_metrics`, `versions`, `channels`, `channel_history`.
- [ ] 1.2 Add the `compute_compat_signature` SQL function and `versions` trigger.
- [ ] 1.3 Add RLS policies (anon read on public tables, auth read on runs, admin writes).
- [ ] 1.4 Add seed data for the `seeds-poc` model line.

## 2. Edge Functions

- [ ] 2.1 Implement `resolve-channel` (update / noop / rebuild_required branches).
- [ ] 2.2 Implement `upload-artifact` with admin check and R2 signed PUT.

## 3. Tests

- [ ] 3.1 SQL tests for schema, RLS, and compat signature.
- [ ] 3.2 Deno tests for both Edge Functions.
- [ ] 3.3 GitHub Actions workflow runs all of the above.

## 4. Validation

- [ ] 4.1 Run `openspec validate --all --strict`.
- [ ] 4.2 Smoke test: `curl /resolve-channel` against a seeded local stack.
```

`openspec/changes/add-model-registry-backend/design.md`:

```markdown
# Design — Add Model Registry Backend

See the full design at
`docs/superpowers/specs/2026-05-02-model-registry-web-app-design.md`.
This OpenSpec change captures only the backend half (schema, RLS, Edge
Functions). The Python SDK, web dashboard, and mobile OTA client are
covered by separate change proposals.
```

`openspec/changes/add-model-registry-backend/specs/model-registry/spec.md`:

```markdown
# model-registry Specification — Backend Delta

## ADDED Requirements

### Requirement: Channel pointer indirection
Each `(model_line, channel_name)` pair SHALL be a single row whose
`current_version_id` is the source of truth for what mobile clients receive.

#### Scenario: Promotion is a single write
- **WHEN** an admin promotes a version
- **THEN** the matching `channels` row's `current_version_id` is updated
- **AND** a `channel_history` row records the from/to transition

### Requirement: OTA compat signature is server-computed
The `versions.compat_signature` column SHALL be computed by a database
trigger from `metadata.class_names`, `metadata.input_size`,
`metadata.output_kind`, and `metadata.task`, so clients cannot disagree
with the server.

#### Scenario: Trigger derives signature on insert
- **WHEN** a row is inserted into `versions` without `compat_signature`
- **THEN** the trigger sets it to the canonical sha256 hex digest

### Requirement: Mobile-facing channel resolution
The `resolve-channel` Edge Function SHALL return one of three actions:
`update`, `noop`, or `rebuild_required`, based on a comparison between the
client's `current_compat`/`current_version` query parameters and the
channel's current version.

#### Scenario: Compat mismatch blocks OTA
- **GIVEN** the channel's current version has a different `compat_signature` than the client's
- **WHEN** the client calls `resolve-channel`
- **THEN** the response action is `rebuild_required`

### Requirement: Artifact uploads require admin
The `upload-artifact` Edge Function SHALL refuse callers whose JWT lacks
the `admin` role, and SHALL return a one-hour R2 signed PUT URL otherwise.

#### Scenario: Anonymous upload is rejected
- **WHEN** an anonymous client calls `upload-artifact`
- **THEN** the function responds with HTTP 401
```

- [ ] **Step 4: Commit**

```bash
git add .gitignore supabase/.env.example openspec/changes/add-model-registry-backend
git commit -m "chore: scaffold model registry backend change"
```

---

### Task A2: Initialize Supabase locally

**Files:**
- Create: `supabase/config.toml` (via CLI)
- Create: `supabase/seed.sql` (empty placeholder, replaced in B5)

- [ ] **Step 1: Install Supabase CLI**

```bash
brew install supabase/tap/supabase
supabase --version
```

Expected: `1.x` or higher.

- [ ] **Step 2: Initialize the project**

```bash
supabase init
```

Expected: creates `supabase/config.toml` and `supabase/seed.sql`.

- [ ] **Step 3: Pin project_id in `supabase/config.toml`**

Verify the file contains:

```toml
project_id = "advance-seeds-model-registry"
```

If the value differs, edit it. Other defaults stay.

- [ ] **Step 4: Boot the local stack and capture keys**

```bash
supabase start
```

Expected: prints `API URL`, `anon key`, `service_role key`. Copy them into a new `supabase/.env.local` (gitignored).

- [ ] **Step 5: Verify Postgres is reachable**

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c 'select 1;'
```

Expected: `1` row returned.

- [ ] **Step 6: Commit**

```bash
git add supabase/config.toml supabase/seed.sql
git commit -m "chore: initialize supabase local stack"
```

---

## Phase B — Schema, Triggers, RLS

### Task B1: `model_lines` migration with SQL test

**Files:**
- Create: `supabase/migrations/20260502000001_model_lines.sql`
- Create: `supabase/tests/sql/schema.test.sql`

- [ ] **Step 1: Write the failing SQL test**

`supabase/tests/sql/schema.test.sql`:

```sql
\set ON_ERROR_STOP on

-- model_lines
SELECT count(*) AS expected_one
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'model_lines';

SELECT slug FROM public.model_lines WHERE slug = 'seeds-poc';
```

- [ ] **Step 2: Run it to confirm failure**

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -f supabase/tests/sql/schema.test.sql
```

Expected: error `relation "public.model_lines" does not exist`.

- [ ] **Step 3: Write the migration**

`supabase/migrations/20260502000001_model_lines.sql`:

```sql
create extension if not exists pgcrypto;

create table public.model_lines (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  display_name text not null,
  created_at   timestamptz not null default now()
);

insert into public.model_lines (slug, display_name)
  values ('seeds-poc', 'Seeds PoC');
```

- [ ] **Step 4: Apply and re-run the test**

```bash
supabase db reset           # applies all migrations from scratch
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -f supabase/tests/sql/schema.test.sql
```

Expected: returns one row with `seeds-poc`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260502000001_model_lines.sql supabase/tests/sql/schema.test.sql
git commit -m "feat(backend): add model_lines table"
```

---

### Task B2: `runs` and `run_metrics` migration

**Files:**
- Create: `supabase/migrations/20260502000002_runs_and_metrics.sql`
- Modify: `supabase/tests/sql/schema.test.sql`

- [ ] **Step 1: Extend the schema test**

Append to `supabase/tests/sql/schema.test.sql`:

```sql
-- runs status enum guard
SAVEPOINT s1;
DO $$ BEGIN
  PERFORM 1 FROM public.runs;
  -- Try invalid status
  INSERT INTO public.runs(model_line_id, status, config_yaml)
    VALUES ((SELECT id FROM public.model_lines WHERE slug='seeds-poc'),
            'invalid-status', '{}'::jsonb);
  RAISE EXCEPTION 'expected status check to reject invalid value';
EXCEPTION WHEN check_violation THEN
  -- expected
  NULL;
END $$;
ROLLBACK TO SAVEPOINT s1;

-- run_metrics index exists
SELECT 1 FROM pg_indexes
WHERE schemaname='public' AND tablename='run_metrics' AND indexname='run_metrics_run_name_step_idx';
```

- [ ] **Step 2: Run the test (expect failure on missing tables)**

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -f supabase/tests/sql/schema.test.sql
```

Expected: error `relation "public.runs" does not exist`.

- [ ] **Step 3: Write the migration**

`supabase/migrations/20260502000002_runs_and_metrics.sql`:

```sql
create table public.runs (
  id            uuid primary key default gen_random_uuid(),
  model_line_id uuid not null references public.model_lines(id),
  status        text not null check (status in ('running','succeeded','failed','cancelled')),
  config_yaml   jsonb not null,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  git_sha       text,
  host          text,
  hardware      jsonb,
  created_by    uuid
);

create index runs_model_line_started_idx
  on public.runs (model_line_id, started_at desc);

create table public.run_metrics (
  run_id      uuid not null references public.runs(id) on delete cascade,
  step        int not null,
  epoch       int,
  name        text not null,
  value       double precision not null,
  recorded_at timestamptz not null default now()
);

create index run_metrics_run_name_step_idx
  on public.run_metrics (run_id, name, step);
```

- [ ] **Step 4: Reset and re-run the test**

```bash
supabase db reset
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -f supabase/tests/sql/schema.test.sql
```

Expected: passes (no errors, index row returned).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260502000002_runs_and_metrics.sql supabase/tests/sql/schema.test.sql
git commit -m "feat(backend): add runs and run_metrics tables"
```

---

### Task B3: `versions` table with `compat_signature` trigger

**Files:**
- Create: `supabase/migrations/20260502000003_versions.sql`
- Create: `supabase/tests/sql/compat_signature.test.sql`

- [ ] **Step 1: Write the failing compat-signature test**

`supabase/tests/sql/compat_signature.test.sql`:

```sql
\set ON_ERROR_STOP on

-- Insert a version without compat_signature; trigger should fill it.
WITH ml AS (SELECT id FROM public.model_lines WHERE slug='seeds-poc')
INSERT INTO public.versions(model_line_id, semver, metadata, tflite_r2_key,
                            size_bytes, content_hash)
VALUES (
  (SELECT id FROM ml),
  '0.0.1-test',
  jsonb_build_object(
    'class_names', jsonb_build_array('apple','apple_spot','banana','banana_spot','orange','orange_spot'),
    'input_size', 640,
    'output_kind', 'end2end_nms_free',
    'task', 'segment'
  ),
  'fixtures/test.tflite',
  1024,
  'sha256:fixture'
)
RETURNING compat_signature;

-- Recompute via the helper and assert equality.
SELECT
  (SELECT compat_signature FROM public.versions WHERE semver='0.0.1-test')
    = public.compute_compat_signature(
        ARRAY['apple','apple_spot','banana','banana_spot','orange','orange_spot'],
        640, 'end2end_nms_free', 'segment'
      ) AS match;
```

- [ ] **Step 2: Run the test (expect missing-table error)**

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -f supabase/tests/sql/compat_signature.test.sql
```

Expected: error `relation "public.versions" does not exist`.

- [ ] **Step 3: Write the migration**

`supabase/migrations/20260502000003_versions.sql`:

```sql
-- Canonical JSON for compat: fixed key order, no whitespace.
create or replace function public.compute_compat_signature(
  class_names text[],
  input_size int,
  output_kind text,
  task text
) returns text
language sql immutable as $$
  select encode(
    digest(
      '{"class_names":' || to_jsonb(class_names)::text
        || ',"input_size":' || input_size::text
        || ',"output_kind":' || to_jsonb(output_kind)::text
        || ',"task":' || to_jsonb(task)::text
        || '}',
      'sha256'
    ),
    'hex'
  );
$$;

create table public.versions (
  id               uuid primary key default gen_random_uuid(),
  run_id           uuid references public.runs(id) on delete set null,
  model_line_id    uuid not null references public.model_lines(id),
  semver           text not null,
  compat_signature text,
  metadata         jsonb not null,
  tflite_r2_key    text not null,
  mlmodel_r2_key   text,
  size_bytes       bigint not null,
  content_hash     text not null,
  created_at       timestamptz not null default now(),
  created_by       uuid,
  unique (model_line_id, semver)
);

create or replace function public.versions_set_compat_signature()
returns trigger language plpgsql as $$
begin
  if new.compat_signature is null then
    new.compat_signature := public.compute_compat_signature(
      array(select jsonb_array_elements_text(new.metadata->'class_names')),
      (new.metadata->>'input_size')::int,
      new.metadata->>'output_kind',
      new.metadata->>'task'
    );
  end if;
  return new;
end;
$$;

create trigger versions_set_compat_signature
before insert or update on public.versions
for each row execute function public.versions_set_compat_signature();
```

- [ ] **Step 4: Reset and run both schema + compat tests**

```bash
supabase db reset
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -f supabase/tests/sql/compat_signature.test.sql
```

Expected: `match | t`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260502000003_versions.sql \
        supabase/tests/sql/compat_signature.test.sql
git commit -m "feat(backend): add versions table with compat_signature trigger"
```

---

### Task B4: `channels` and `channel_history` with audit trigger

**Files:**
- Create: `supabase/migrations/20260502000004_channels.sql`
- Modify: `supabase/tests/sql/schema.test.sql`

- [ ] **Step 1: Append channel-audit test**

Append to `supabase/tests/sql/schema.test.sql`:

```sql
-- Promote: update channels.current_version_id and expect channel_history row.
WITH ml AS (SELECT id FROM public.model_lines WHERE slug='seeds-poc'),
     v  AS (SELECT id FROM public.versions WHERE semver='0.0.1-test')
UPDATE public.channels
SET current_version_id = (SELECT id FROM v),
    updated_by = '00000000-0000-0000-0000-000000000000'
WHERE model_line_id = (SELECT id FROM ml) AND name = 'staging';

SELECT count(*) AS history_rows
FROM public.channel_history
WHERE to_version_id = (SELECT id FROM public.versions WHERE semver='0.0.1-test');
```

- [ ] **Step 2: Run the test (expect missing-table)**

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -f supabase/tests/sql/schema.test.sql
```

Expected: error `relation "public.channels" does not exist`.

- [ ] **Step 3: Write the migration**

`supabase/migrations/20260502000004_channels.sql`:

```sql
create table public.channels (
  id                 uuid primary key default gen_random_uuid(),
  model_line_id      uuid not null references public.model_lines(id),
  name               text not null check (name in ('staging','production')),
  current_version_id uuid references public.versions(id),
  updated_at         timestamptz not null default now(),
  updated_by         uuid,
  unique (model_line_id, name)
);

create table public.channel_history (
  id              uuid primary key default gen_random_uuid(),
  channel_id      uuid not null references public.channels(id) on delete cascade,
  from_version_id uuid references public.versions(id),
  to_version_id   uuid references public.versions(id),
  reason          text,
  changed_at      timestamptz not null default now(),
  changed_by      uuid
);

create or replace function public.channels_audit()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE'
     and new.current_version_id is distinct from old.current_version_id then
    insert into public.channel_history(
      channel_id, from_version_id, to_version_id, changed_by)
    values (new.id, old.current_version_id, new.current_version_id, new.updated_by);
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create trigger channels_audit
before update on public.channels
for each row execute function public.channels_audit();

-- Seed the two channels for the PoC line, both initially unset.
insert into public.channels(model_line_id, name)
select id, 'staging'    from public.model_lines where slug='seeds-poc';
insert into public.channels(model_line_id, name)
select id, 'production' from public.model_lines where slug='seeds-poc';
```

- [ ] **Step 4: Reset and run schema + compat tests**

```bash
supabase db reset
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -f supabase/tests/sql/compat_signature.test.sql
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -f supabase/tests/sql/schema.test.sql
```

Expected: `history_rows | 1`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260502000004_channels.sql supabase/tests/sql/schema.test.sql
git commit -m "feat(backend): add channels with audit trigger"
```

---

### Task B5: RLS policies + admin role helper

**Files:**
- Create: `supabase/migrations/20260502000005_rls.sql`
- Create: `supabase/tests/sql/rls.test.sql`

- [ ] **Step 1: Write the failing RLS test**

`supabase/tests/sql/rls.test.sql`:

```sql
\set ON_ERROR_STOP on

-- Anon: can SELECT from versions, cannot INSERT.
SET ROLE anon;
SELECT count(*) >= 0 AS anon_select_versions FROM public.versions;

DO $$ BEGIN
  INSERT INTO public.versions(model_line_id, semver, metadata, tflite_r2_key,
                              size_bytes, content_hash)
  VALUES ((SELECT id FROM public.model_lines WHERE slug='seeds-poc'),
          'rls-test', '{"class_names":[],"input_size":1,"output_kind":"x","task":"y"}',
          'k', 1, 'h');
  RAISE EXCEPTION 'anon should not be able to insert';
EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL;
END $$;
RESET ROLE;

-- Authenticated (no admin claim): can SELECT runs, cannot UPDATE channels.
SET ROLE authenticated;
SELECT count(*) >= 0 AS auth_select_runs FROM public.runs;

DO $$ BEGIN
  UPDATE public.channels SET updated_by = gen_random_uuid()
  WHERE name = 'staging';
  RAISE EXCEPTION 'authenticated without admin should not be able to update channels';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
RESET ROLE;
```

- [ ] **Step 2: Run the test (expect failure — no policies yet)**

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -f supabase/tests/sql/rls.test.sql
```

Expected: failure (anon can either freely insert or is blocked for the wrong reason). The test asserts the *correct* shape.

- [ ] **Step 3: Write the migration**

`supabase/migrations/20260502000005_rls.sql`:

```sql
-- Helper: does the current JWT carry the admin role?
-- Service-role calls already bypass RLS by virtue of the postgres role they
-- run as, so this only needs to recognize admin users authenticated via
-- normal sign-in. Convention: admin users have app_metadata.role = 'admin'.
create or replace function public.is_admin()
returns boolean language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb
      -> 'app_metadata' ->> 'role', ''
  ) = 'admin';
$$;

-- Enable RLS
alter table public.model_lines     enable row level security;
alter table public.runs            enable row level security;
alter table public.run_metrics     enable row level security;
alter table public.versions        enable row level security;
alter table public.channels        enable row level security;
alter table public.channel_history enable row level security;

-- Public-readable: model_lines, versions, channels, channel_history
create policy ml_select_all on public.model_lines
  for select using (true);
create policy ver_select_all on public.versions
  for select using (true);
create policy ch_select_all on public.channels
  for select using (true);
create policy chh_select_all on public.channel_history
  for select using (true);

-- Authenticated read: runs, run_metrics
create policy runs_select_auth on public.runs
  for select using (auth.role() = 'authenticated' or public.is_admin());
create policy rm_select_auth on public.run_metrics
  for select using (auth.role() = 'authenticated' or public.is_admin());

-- Admin-only writes on every table
create policy ml_admin_write   on public.model_lines     for all using (public.is_admin()) with check (public.is_admin());
create policy runs_admin_write on public.runs            for all using (public.is_admin()) with check (public.is_admin());
create policy rm_admin_write   on public.run_metrics     for all using (public.is_admin()) with check (public.is_admin());
create policy ver_admin_write  on public.versions        for all using (public.is_admin()) with check (public.is_admin());
create policy ch_admin_write   on public.channels        for all using (public.is_admin()) with check (public.is_admin());
create policy chh_admin_write  on public.channel_history for all using (public.is_admin()) with check (public.is_admin());
```

- [ ] **Step 4: Reset and re-run RLS test**

```bash
supabase db reset
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -f supabase/tests/sql/rls.test.sql
```

Expected: completes without error.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260502000005_rls.sql supabase/tests/sql/rls.test.sql
git commit -m "feat(backend): enforce RLS for public/auth/admin tiers"
```

---

### Task B6: Test fixture seed (for Edge Function tests)

**Files:**
- Create: `supabase/migrations/20260502000006_seed.sql`
- Create: `supabase/tests/fixtures/seed_run_v1.sql`

- [ ] **Step 1: Add the migration that registers a deterministic test fixture loader**

`supabase/migrations/20260502000006_seed.sql`:

```sql
-- This migration is intentionally empty for production. Test fixtures live
-- under supabase/tests/fixtures/ and are loaded explicitly by tests.
select 1;
```

- [ ] **Step 2: Write the fixture file**

`supabase/tests/fixtures/seed_run_v1.sql`:

```sql
-- One run, one version (seeds-poc, v1.0.0), staging pointed at it.
WITH ml AS (SELECT id FROM public.model_lines WHERE slug='seeds-poc')
INSERT INTO public.runs(id, model_line_id, status, config_yaml, finished_at, host)
VALUES ('00000000-0000-0000-0000-0000000000aa',
        (SELECT id FROM ml), 'succeeded',
        '{"hyper":"fixture"}'::jsonb, now(), 'fixture');

INSERT INTO public.versions(id, run_id, model_line_id, semver, metadata,
                            tflite_r2_key, size_bytes, content_hash)
VALUES ('00000000-0000-0000-0000-0000000000bb',
        '00000000-0000-0000-0000-0000000000aa',
        (SELECT id FROM public.model_lines WHERE slug='seeds-poc'),
        '1.0.0',
        jsonb_build_object(
          'class_names', jsonb_build_array('apple','apple_spot','banana','banana_spot','orange','orange_spot'),
          'input_size', 640,
          'output_kind', 'end2end_nms_free',
          'task', 'segment'
        ),
        'fixtures/seeds-poc-1.0.0.tflite',
        12345, 'sha256:fixture-1.0.0');

UPDATE public.channels
SET current_version_id = '00000000-0000-0000-0000-0000000000bb',
    updated_by = '00000000-0000-0000-0000-000000000000'
WHERE name = 'staging'
  AND model_line_id = (SELECT id FROM public.model_lines WHERE slug='seeds-poc');
```

- [ ] **Step 3: Verify fixture loads cleanly**

```bash
supabase db reset
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -f supabase/tests/fixtures/seed_run_v1.sql
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -c "SELECT name, current_version_id IS NOT NULL AS has_version FROM public.channels;"
```

Expected: staging row shows `has_version = t`, production shows `has_version = f`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260502000006_seed.sql supabase/tests/fixtures/seed_run_v1.sql
git commit -m "test(backend): add deterministic v1 fixture"
```

---

## Phase C — Edge Functions

### Task C1: Shared utilities for Edge Functions

**Files:**
- Create: `supabase/functions/_shared/cors.ts`
- Create: `supabase/functions/_shared/supabase.ts`
- Create: `supabase/functions/_shared/r2.ts`
- Create: `supabase/functions/_shared/compat.ts`
- Create: `supabase/functions/_shared/compat.test.ts`

- [ ] **Step 1: Write the failing compat parity test**

`supabase/functions/_shared/compat.test.ts`:

```ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { computeCompatSignature } from "./compat.ts";

Deno.test("compat signature matches the SQL canonical form", async () => {
  const sig = await computeCompatSignature({
    class_names: ["apple","apple_spot","banana","banana_spot","orange","orange_spot"],
    input_size: 640,
    output_kind: "end2end_nms_free",
    task: "segment",
  });
  // Computed once via psql:
  //   SELECT public.compute_compat_signature(...);
  // Recorded here so any drift between TS and SQL fails this test.
  assertEquals(
    sig,
    "REPLACE_WITH_SQL_VALUE",
  );
});
```

- [ ] **Step 2: Capture the SQL-side reference value**

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -At -c "
  SELECT public.compute_compat_signature(
    ARRAY['apple','apple_spot','banana','banana_spot','orange','orange_spot'],
    640, 'end2end_nms_free', 'segment'
  );"
```

Replace `REPLACE_WITH_SQL_VALUE` in the test with the printed hex digest.

- [ ] **Step 3: Run the test to confirm it fails (no implementation yet)**

```bash
deno test supabase/functions/_shared/compat.test.ts --allow-net=false
```

Expected: failure — `computeCompatSignature` is not exported.

- [ ] **Step 4: Implement compat.ts**

`supabase/functions/_shared/compat.ts`:

```ts
export interface CompatInput {
  class_names: string[];
  input_size: number;
  output_kind: string;
  task: string;
}

export async function computeCompatSignature(input: CompatInput): Promise<string> {
  const canonical =
    `{"class_names":${JSON.stringify(input.class_names)}` +
    `,"input_size":${input.input_size}` +
    `,"output_kind":${JSON.stringify(input.output_kind)}` +
    `,"task":${JSON.stringify(input.task)}}`;
  const bytes = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
```

- [ ] **Step 5: Run the test (must pass)**

```bash
deno test supabase/functions/_shared/compat.test.ts --allow-net=false
```

Expected: PASS.

- [ ] **Step 6: Implement cors.ts and supabase.ts**

`supabase/functions/_shared/cors.ts`:

```ts
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
```

`supabase/functions/_shared/supabase.ts`:

```ts
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export function serviceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("supabase env not configured");
  return createClient(url, key, { auth: { persistSession: false } });
}
```

- [ ] **Step 7: Implement r2.ts**

`supabase/functions/_shared/r2.ts`:

```ts
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "https://esm.sh/@aws-sdk/client-s3@3.620.0";
import { getSignedUrl } from "https://esm.sh/@aws-sdk/s3-request-presigner@3.620.0";

function client(): S3Client {
  const accountId = Deno.env.get("R2_ACCOUNT_ID");
  const accessKeyId = Deno.env.get("R2_ACCESS_KEY_ID");
  const secretAccessKey = Deno.env.get("R2_SECRET_ACCESS_KEY");
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("R2 env not configured");
  }
  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

const BUCKET = () => Deno.env.get("R2_BUCKET") ?? "advance-seeds-models";

export async function presignGet(key: string, expiresIn = 3600): Promise<string> {
  return await getSignedUrl(
    client(),
    new GetObjectCommand({ Bucket: BUCKET(), Key: key }),
    { expiresIn },
  );
}

export async function presignPut(
  key: string,
  contentType = "application/octet-stream",
  expiresIn = 900,
): Promise<string> {
  return await getSignedUrl(
    client(),
    new PutObjectCommand({ Bucket: BUCKET(), Key: key, ContentType: contentType }),
    { expiresIn },
  );
}
```

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/_shared
git commit -m "feat(backend): add shared edge function utils + compat parity test"
```

---

### Task C2: `resolve-channel` happy path

**Files:**
- Create: `supabase/functions/resolve-channel/index.ts`
- Create: `supabase/functions/resolve-channel/index.test.ts`

- [ ] **Step 1: Write the failing happy-path test**

`supabase/functions/resolve-channel/index.test.ts`:

```ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const FN = "http://127.0.0.1:54321/functions/v1/resolve-channel";
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

async function call(qs: string): Promise<Response> {
  return await fetch(`${FN}?${qs}`, {
    headers: { Authorization: `Bearer ${ANON}`, apikey: ANON },
  });
}

Deno.test("returns update when client has no current_version", async () => {
  const r = await call("channel=staging&model_line=seeds-poc&current_compat=&current_version=");
  assertEquals(r.status, 200);
  const body = await r.json();
  assertEquals(body.action, "update");
  assertEquals(body.semver, "1.0.0");
  if (typeof body.model_url !== "string") {
    throw new Error("expected signed model_url");
  }
});
```

- [ ] **Step 2: Boot and seed, run test (expect 404 — function not deployed)**

```bash
supabase db reset
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -f supabase/tests/fixtures/seed_run_v1.sql
supabase functions serve resolve-channel --env-file supabase/.env.local &
SERVE_PID=$!
deno test supabase/functions/resolve-channel/index.test.ts --allow-net --allow-env
kill $SERVE_PID
```

Expected: test fails with `404` or connection error.

- [ ] **Step 3: Implement the function**

`supabase/functions/resolve-channel/index.ts`:

```ts
import { corsHeaders } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { presignGet } from "../_shared/r2.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  const url = new URL(req.url);
  const channel = url.searchParams.get("channel") ?? "";
  const lineSlug = url.searchParams.get("model_line") ?? "";
  const currentCompat = url.searchParams.get("current_compat") ?? "";
  const currentVersion = url.searchParams.get("current_version") ?? "";

  if (!channel || !lineSlug) {
    return json({ error: "channel and model_line required" }, 400);
  }

  const sb = serviceClient();
  const { data: line } = await sb
    .from("model_lines").select("id").eq("slug", lineSlug).maybeSingle();
  if (!line) return json({ error: "unknown model_line" }, 404);

  const { data: ch } = await sb
    .from("channels")
    .select("current_version_id")
    .eq("model_line_id", line.id).eq("name", channel).maybeSingle();
  if (!ch) return json({ error: "unknown channel" }, 404);
  if (!ch.current_version_id) return json({ action: "noop", reason: "channel_unset" });

  const { data: v } = await sb
    .from("versions")
    .select("id, semver, compat_signature, metadata, tflite_r2_key, content_hash")
    .eq("id", ch.current_version_id).maybeSingle();
  if (!v) return json({ error: "current_version_id stale" }, 500);

  if (currentCompat && currentCompat !== v.compat_signature) {
    return json({
      action: "rebuild_required",
      reason: "compat_signature_changed",
      expected_compat: v.compat_signature,
      current_compat: currentCompat,
    });
  }
  if (currentVersion === v.id) return json({ action: "noop" });

  const modelUrl = await presignGet(v.tflite_r2_key, 3600);
  return json({
    action: "update",
    version_id: v.id,
    semver: v.semver,
    model_url: modelUrl,
    metadata: v.metadata,
    content_hash: v.content_hash,
  });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders },
  });
}
```

- [ ] **Step 4: Run the happy-path test**

For local R2 signing without real credentials, set the test env to point at a MinIO instance OR stub by skipping the URL shape assertion. For this step, configure `supabase/.env.local` to point at a real R2 sandbox bucket (developer's personal account is fine for local) — see `docs/backend-setup.md` (Task D2). With env loaded, re-run the serve+test sequence from Step 2.

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/resolve-channel
git commit -m "feat(backend): implement resolve-channel update path"
```

---

### Task C3: `resolve-channel` mismatch + noop branches

**Files:**
- Modify: `supabase/functions/resolve-channel/index.test.ts`

- [ ] **Step 1: Append branch tests**

```ts
Deno.test("returns rebuild_required on compat mismatch", async () => {
  const r = await call(
    "channel=staging&model_line=seeds-poc&current_compat=deadbeef&current_version=",
  );
  assertEquals(r.status, 200);
  const body = await r.json();
  assertEquals(body.action, "rebuild_required");
  assertEquals(body.reason, "compat_signature_changed");
});

Deno.test("returns noop when client already on current version", async () => {
  // First fetch the current version id via update path, then re-call with it.
  const first = await (await call(
    "channel=staging&model_line=seeds-poc&current_compat=&current_version=",
  )).json();
  const r = await call(
    `channel=staging&model_line=seeds-poc&current_compat=${first.metadata ? "" : ""}&current_version=${first.version_id}`,
  );
  const body = await r.json();
  assertEquals(body.action, "noop");
});

Deno.test("returns noop when channel is unset", async () => {
  const r = await call("channel=production&model_line=seeds-poc&current_compat=&current_version=");
  const body = await r.json();
  assertEquals(body.action, "noop");
  assertEquals(body.reason, "channel_unset");
});
```

- [ ] **Step 2: Run all `resolve-channel` tests**

```bash
supabase db reset
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -f supabase/tests/fixtures/seed_run_v1.sql
supabase functions serve resolve-channel --env-file supabase/.env.local &
deno test supabase/functions/resolve-channel/index.test.ts --allow-net --allow-env
kill %1
```

Expected: all four tests PASS (the existing implementation already covers these branches).

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/resolve-channel/index.test.ts
git commit -m "test(backend): cover resolve-channel mismatch and noop branches"
```

---

### Task C4: `upload-artifact` with admin guard

**Files:**
- Create: `supabase/functions/upload-artifact/index.ts`
- Create: `supabase/functions/upload-artifact/index.test.ts`

- [ ] **Step 1: Write the failing tests**

`supabase/functions/upload-artifact/index.test.ts`:

```ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const FN = "http://127.0.0.1:54321/functions/v1/upload-artifact";
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function post(body: unknown, jwt: string): Promise<Response> {
  return await fetch(FN, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      apikey: ANON,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

Deno.test("anon caller is rejected", async () => {
  const r = await post({ kind: "tflite", run_id: "x" }, ANON);
  assertEquals(r.status, 401);
});

Deno.test("service-role caller gets a signed PUT URL", async () => {
  const r = await post(
    { kind: "tflite", run_id: "00000000-0000-0000-0000-0000000000aa", semver: "1.1.0" },
    SERVICE,
  );
  assertEquals(r.status, 200);
  const body = await r.json();
  if (typeof body.upload_url !== "string" || !body.upload_url.includes("X-Amz-Signature")) {
    throw new Error("expected presigned PUT URL");
  }
  assertEquals(typeof body.r2_key, "string");
});
```

- [ ] **Step 2: Implement the function**

`supabase/functions/upload-artifact/index.ts`:

```ts
import { corsHeaders } from "../_shared/cors.ts";
import { presignPut } from "../_shared/r2.ts";

interface Body {
  kind: "tflite" | "mlmodel";
  run_id: string;
  semver: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const role = roleFromJwt(req.headers.get("authorization") ?? "");
  if (role !== "service_role" && role !== "admin") {
    return json({ error: "unauthorized" }, 401);
  }

  let body: Body;
  try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }
  if (!body.kind || !body.run_id || !body.semver) {
    return json({ error: "kind, run_id, semver required" }, 400);
  }

  const ext = body.kind === "tflite" ? "tflite" : "mlmodel";
  const r2Key = `runs/${body.run_id}/${body.semver}.${ext}`;
  const uploadUrl = await presignPut(r2Key);
  return json({ upload_url: uploadUrl, r2_key: r2Key });
});

function json(b: unknown, status = 200): Response {
  return new Response(JSON.stringify(b), {
    status, headers: { "content-type": "application/json", ...corsHeaders },
  });
}

function roleFromJwt(authHeader: string): string | null {
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    // service_role: top-level "role" claim. admin user: app_metadata.role.
    if (payload.role === "service_role") return "service_role";
    if (payload.app_metadata?.role === "admin") return "admin";
    return payload.role ?? null;
  } catch { return null; }
}
```

- [ ] **Step 3: Run tests**

```bash
supabase functions serve upload-artifact --env-file supabase/.env.local &
deno test supabase/functions/upload-artifact/index.test.ts --allow-net --allow-env
kill %1
```

Expected: both tests PASS.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/upload-artifact
git commit -m "feat(backend): implement upload-artifact with admin guard"
```

---

## Phase D — CI and Deploy Docs

### Task D1: GitHub Actions workflow

**Files:**
- Create: `.github/workflows/backend.yml`

- [ ] **Step 1: Write the workflow**

```yaml
name: backend

on:
  pull_request:
    paths: [ 'supabase/**', '.github/workflows/backend.yml' ]
  push:
    branches: [ main ]
    paths: [ 'supabase/**', '.github/workflows/backend.yml' ]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: denoland/setup-deno@v1
        with: { deno-version: v1.x }
      - uses: supabase/setup-cli@v1
        with: { version: latest }
      - name: Start Supabase
        run: supabase start
      - name: Apply migrations
        run: supabase db reset
      - name: SQL tests
        env:
          PGURL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
        run: |
          psql "$PGURL" -f supabase/tests/sql/schema.test.sql
          psql "$PGURL" -f supabase/tests/sql/compat_signature.test.sql
          psql "$PGURL" -f supabase/tests/sql/rls.test.sql
      - name: Compat parity test
        run: deno test supabase/functions/_shared/compat.test.ts --allow-net=false
      - name: Edge function tests
        env:
          R2_ACCOUNT_ID: ${{ secrets.R2_ACCOUNT_ID }}
          R2_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}
          R2_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
          R2_BUCKET: ${{ secrets.R2_BUCKET }}
        run: |
          # Build env file from the just-started Supabase stack + R2 secrets.
          supabase status -o env > supabase/.env.ci
          {
            echo "R2_ACCOUNT_ID=$R2_ACCOUNT_ID"
            echo "R2_ACCESS_KEY_ID=$R2_ACCESS_KEY_ID"
            echo "R2_SECRET_ACCESS_KEY=$R2_SECRET_ACCESS_KEY"
            echo "R2_BUCKET=$R2_BUCKET"
          } >> supabase/.env.ci

          psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
            -f supabase/tests/fixtures/seed_run_v1.sql
          supabase functions serve --env-file supabase/.env.ci &
          SERVE_PID=$!
          sleep 5
          set -a; source supabase/.env.ci; set +a
          deno test supabase/functions --allow-net --allow-env
          kill $SERVE_PID
```

- [ ] **Step 2: Verify the workflow lints**

```bash
yamllint .github/workflows/backend.yml || true   # advisory; CI will run authoritatively
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/backend.yml
git commit -m "ci: run backend migrations + tests on PR"
```

---

### Task D2: Operator deployment guide

**Files:**
- Create: `docs/backend-setup.md`

- [ ] **Step 1: Write the guide**

````markdown
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
````

- [ ] **Step 2: Commit**

```bash
git add docs/backend-setup.md
git commit -m "docs: add backend setup guide"
```

---

### Task D3: Close out OpenSpec change

**Files:**
- Modify: `openspec/changes/add-model-registry-backend/tasks.md`

- [ ] **Step 1: Tick all tasks complete**

In `openspec/changes/add-model-registry-backend/tasks.md`, replace every `- [ ]` with `- [x]`.

- [ ] **Step 2: Validate**

```bash
openspec validate --all --strict
```

Expected: PASS.

- [ ] **Step 3: Archive the change**

```bash
openspec archive add-model-registry-backend
```

- [ ] **Step 4: Commit**

```bash
git add openspec
git commit -m "chore(openspec): archive add-model-registry-backend"
```

---

## Done Criteria

- All migrations apply cleanly via `supabase db reset`.
- All SQL tests pass.
- Compat signature parity test passes (TS == SQL).
- `resolve-channel` returns `update`, `noop`, `noop+channel_unset`, and `rebuild_required` on the four corresponding inputs.
- `upload-artifact` returns 401 for anon and a signed URL for service_role.
- `backend` GitHub Actions workflow is green.
- OpenSpec change `add-model-registry-backend` is archived.
- `docs/backend-setup.md` walks a fresh operator from zero to a working local stack and a deployed cloud project.

After this plan executes, the next plan ("Python SDK + training hook") can assume a working backend at the Supabase URL recorded in `supabase/.env.local`.
