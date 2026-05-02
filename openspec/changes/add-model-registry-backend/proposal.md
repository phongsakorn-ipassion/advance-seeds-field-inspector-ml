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

## Capabilities

### New Capabilities

- `model-registry`: versioned OTA artifact registry backed by Supabase + Cloudflare R2.

## Non-goals

- Python training SDK hook.
- Web dashboard.
- Mobile OTA client (those are separate change proposals).

## Impact

- New capability spec: `model-registry`.
- No changes to existing capabilities yet (the Python SDK and training-script
  hook arrive in a follow-up plan).
- New external dependencies: Supabase project, Cloudflare R2 bucket.
