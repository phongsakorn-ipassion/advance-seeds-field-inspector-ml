## ADDED Requirements

### Requirement: Dashboard surfaces registry activity notifications
The dashboard SHALL show recent model registry activity in an in-app
notification center without requiring operators to inspect every screen.

#### Scenario: Activity appears in the notification center
- **WHEN** runs, model versions, deployments, or storage records are present in
  the current registry snapshot
- **THEN** the dashboard SHALL derive recent activity notifications from those
  records
- **AND** the topbar notification center SHALL show the most recent activities

#### Scenario: New activity arrives while viewing the dashboard
- **WHEN** Supabase Realtime refreshes the dashboard with a new activity after
  the initial page load
- **THEN** the dashboard SHALL show a short in-app toast for that activity
- **AND** the notification center SHALL reflect the unread activity count

#### Scenario: Operator reviews unread count
- **WHEN** there are zero or more unread activities
- **THEN** the notification trigger SHALL show the unread count as a visible
  number

#### Scenario: Operator manages read state
- **WHEN** an operator opens the notification center
- **THEN** each notification SHALL show whether it is read or unread
- **AND** clicking a notification record SHALL mark that notification as read
- **AND** clicking Mark all read SHALL mark all current notifications as read
- **AND** read state SHALL persist across browser refreshes for that signed-in
  operator
- **AND** there SHALL NOT be a separate read/unread checkbox or toggle button

### Requirement: Live tracking maps Ultralytics metrics
The dashboard SHALL map metric names emitted by Ultralytics training runs into
the existing live-tracking progress and metric fields.

#### Scenario: Ultralytics metrics are inserted
- **WHEN** `run_metrics` contains `progress`, `metrics/mAP50(B)`, or
  `metrics/mAP50-95(M)` rows for a running run
- **THEN** the Live tracking row SHALL update progress and no longer remain in
  the waiting display state
- **AND** mAP50 and mask metric values SHALL render when available
