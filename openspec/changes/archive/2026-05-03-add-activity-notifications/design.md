## Design

The first notification slice is client-derived. The registry store already
refreshes from Supabase Realtime changes, so the app can turn each snapshot
into a stable list of recent activity without adding tables or Edge Functions.

Notifications are keyed by stable entity plus state, for example
`run:<id>:succeeded`, `version:<id>:created`, and
`deployment:<channel>:<versionId>`. The topbar notification center shows the
latest activities and an unread count. A small toast stack appears only for
new activities after initial page load.

Live tracking keeps using `run_metrics`, but metric names are normalized in the
Supabase store so Ultralytics names such as `metrics/mAP50(B)` and
`metrics/mAP50-95(M)` populate the existing UI fields.

## Risk

Because notifications are derived from the current snapshot, they are bounded
to the rows currently loaded by the dashboard. That is acceptable for v1; a
server-side activity table can be added later if operators need long-term audit
history beyond the registry tables.
