## Why

Operators need one place to see what changed across training, deployment,
storage, and model lifecycle work. Today the dashboard has live logs and status
cards, but important activity is scattered across screens and can be missed.

## What Changes

- Add an in-app notification center in the dashboard topbar.
- Show short realtime toast notifications when new activity arrives while the
  operator is viewing the dashboard.
- Derive notifications from existing registry state: runs, versions, channel
  deployments, channels, and storage rows.
- Fix live-tracking metric normalization so Ultralytics metric names update the
  run status, progress, and metric display while logs stream.

## Non-goals

- No email, SMS, browser push, or mobile push notifications.
- No new persistent notification table for v1.
- No service-role or R2 credentials in the browser.
