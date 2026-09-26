## Context

`apps/web` is a client-only React SPA (no server-side router, no persisted session in
demo mode) served by Vite. The `ipassion-qa-automation` plugin's qaplay harness
(Playwright + pytest + AI-judged evidence) assumes a fairly conventional app: a login
URL to detect an expired session, and a `storage_state` cache to skip re-authenticating
per test. Neither assumption held here, and several selectors that looked right during
manual exploration turned out wrong once actually run.

## Goals / Non-Goals

**Goals:**
- Working, passing QA coverage for the dashboard's core flows (auth, training,
  model lifecycle, storage) against demo mode.
- Selectors and page objects verified against the live app and the source, not guessed
  from a system-summary paraphrase.
- Any real bug the run surfaces gets root-caused and fixed, not just worked around.

**Non-Goals:**
- Coverage against a real Supabase-backed environment (no non-admin account exists
  there; the demo-mode test data — specific semvers, R2 keys — doesn't exist there
  either).
- Exhaustive coverage of every screen (e.g., the Swagger API explorer, Colab handoff
  checklist are out of scope for this first pass).

## Decisions

- **Login-screen detection is DOM-based, not URL-based.** The qaplay template detects a
  dead cached session by checking for a login-page URL substring. This app has no
  router — the login screen and every authenticated screen share one URL — so that
  check would either never fire or always fire. `conftest.py`'s `_on_login_screen()`
  instead checks for the one-click admin card's presence.
- **`page_as()`'s session cache doesn't apply to demo mode.** Demo mode's "signed in"
  state lives in in-memory React state, not a cookie or `localStorage` key, so a
  `storage_state` snapshot captured right after login carries nothing that says "signed
  in" once replayed into a new context — every cached-session reuse came back logged
  out. Non-AUTH tests sign in directly via `flows/auth_flow.py` helpers instead of
  `page_as`. This likely does not affect a real Supabase-backed run, where
  `persistSession: true` puts the session in `localStorage` — `page_as`/`conftest.login()`
  are left working as designed for that case.
- **A button's `title` tooltip is not its accessible name when it has visible content.**
  Several lifecycle buttons (`Deploy to Prod`, `Delete model`, `Undeploy {channel}`) only
  have a `title` attribute plus visible text — no `aria-label`. Manual exploration
  during page-object construction misread the `title` text as the accessible name;
  cross-checking against `App.tsx` source and an empirical
  `get_by_role(...).count()` check caught this before it shipped as a broken selector.
  Same root cause hit `get_by_label()` on several form fields (it matched a
  hint-tooltip's own button instead of the field) — worked around by scoping to the
  `<label>`'s own leading text instead.
- **`1.0.4--042` (the "candidate" demo version) is not part of the deterministic seed
  data.** It's synthesized later by the demo ticker completing an in-progress run, so
  its presence is timing-dependent. Test data uses the three genuinely static seed
  versions (`1.0.0-seeds-v2`, `0.9.2-seeds-v1`, `0.7.0-archive`) instead.
- **The "sub-nav double-click breaks the run list" finding was a false positive**, caught
  by adding (then removing) console instrumentation. Playwright's `click()` waits for
  its target to be stable; the Live-tracking tab's badge re-renders every ~1.5s from the
  demo ticker, so the click never fires until every run happens to finish naturally — by
  then the list really is empty, but nothing in the app is broken. The test-side fix
  (never re-click a tab already known to be active) stands; no app code changed.
- **The read-only test account is demo-mode-only, added at the store level, not a
  workaround.** `demoReadOnly` lives next to `demoAdmin` in `demoStore.ts` and is
  documented in the modified spec requirement, since it makes an existing, previously
  untestable requirement ("non-admin session is read-only") actually verifiable in demo
  mode.

## Risks / Trade-offs

- Demo-mode-only coverage means a real regression that only manifests against live
  Supabase data (RLS, real error messages, real Realtime timing) won't be caught by this
  suite. Documented as a known gap, not silently assumed away.
- The demo ticker's background activity (progress advancing, toasts firing) makes some
  screenshots timing-sensitive; a couple of AI-judged passes noted a screenshot caught a
  transient state but confirmed the underlying behavior was correct on live
  re-verification rather than failing the TC.
