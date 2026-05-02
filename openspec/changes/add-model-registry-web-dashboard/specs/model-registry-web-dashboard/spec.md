## ADDED Requirements

### Requirement: Dashboard shows registry operating state
The web dashboard SHALL show the current staging and production channel state,
recent training runs, and registered model versions on the first screen.

#### Scenario: Operator opens dashboard
- **WHEN** the dashboard loads
- **THEN** staging and production channel cards are visible
- **AND** recent run status is visible
- **AND** model version rows are visible

### Requirement: Dashboard separates sample data from UI components
The web dashboard SHALL keep registry data access in a dedicated module so
sample data can be replaced with Supabase queries without rewriting the view
components.

#### Scenario: Data source is replaced later
- **WHEN** Supabase integration is added
- **THEN** existing dashboard components receive the same run, version, and
  channel-shaped data from the data module

### Requirement: Dashboard builds as a static GitHub Pages app
The dashboard SHALL build to static assets with Vite and SHALL avoid requiring a
custom Node server at runtime.

#### Scenario: Static build succeeds
- **WHEN** the web app build command runs
- **THEN** `apps/web/dist/` contains static assets suitable for GitHub Pages
