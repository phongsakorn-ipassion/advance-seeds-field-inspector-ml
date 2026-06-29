# Design

## Parent-run cleanup rule
`versions.run_id` is declared `ON DELETE SET NULL`, and the schema allows more
than one version per run. So deleting a run unconditionally would strip the
`run_id` of any sibling versions and orphan their training history.

Rule: after the `versions` row is deleted, look up how many versions still
reference `run_id`. Delete the `runs` row (which cascades `run_metrics`) only
when that count is zero. The response reports `deleted_run` (the run id, or
`null` when the run was kept).

## Why not keep "Archive"?
Archive's value was a recoverable history record, but it left dangling rows in
Model versions that operators found confusing. A delete that removes the row is
what was requested. Legacy archived rows remain readable, so the archive display
path stays; only the write action is replaced.

## Guards (unchanged)
Delete is refused with HTTP 409 while the version is the `current_version_id` of
any channel or has an `active` `channel_deployments` row. The UI keeps the
"undeploy first" disabled state. This prevents deleting a version the app is
actively resolving for a channel.

## Confirmation UX
A standard danger modal (same component as before) with copy that states the
delete is permanent and also removes the training run. No type-to-confirm — the
admin-only + undeploy-first guards plus the modal were judged sufficient.

## Demo store parity
`demoStore.deleteVersion` mirrors the backend: it refuses when the version is on
a channel or deployed, removes the version and its storage entries from the
snapshot, and drops the parent run unless a sibling version still references it.
