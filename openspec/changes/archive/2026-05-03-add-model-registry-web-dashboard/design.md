## Context

Plan 1 built the Supabase/R2 backend and Plan 2 added a Python SDK. The next
operator-facing step is a static GitHub Pages dashboard that will eventually use
Supabase Auth/Realtime and Edge Functions, but the initial slice should create
the app shell and workflow anatomy before wiring live data.

## Goals / Non-Goals

**Goals:**

- Create `apps/web/` with Vite, React, TypeScript, and production build support.
- Build the real registry operator screen as the first viewport: channel state,
  run activity, version comparison, and promotion actions.
- Keep data access behind a small module so sample data can later be replaced
  with Supabase queries.
- Use a restrained operational dashboard style rather than a marketing page.

**Non-Goals:**

- No live Supabase Auth or writes in this slice.
- No R2 access from the browser.
- No model upload from the dashboard.
- No mobile app changes.

## Decisions

- **React + Vite:** Matches the approved stack and keeps GitHub Pages hosting
  simple.
- **Sample data first:** Allows UI structure, responsive behavior, and component
  boundaries to be validated before live auth/query work.
- **Dense dashboard layout:** Field model operators need scan-friendly state and
  actions, so the UI uses tables, side panels, and compact charts instead of a
  landing-page composition.

## Risks / Trade-offs

- **Sample data can drift from schema** -> Keep field names aligned with the
  Supabase tables and reuse backend terminology (`runs`, `versions`, `channels`).
- **GitHub Pages base path** -> Vite config uses a relative base so the build can
  be served from a project page path.
