"""flows/auth_flow.py — signing in, both as a TC step and as bare setup.

`conftest.py`'s own `login()` (used by `page_as` via `auth.ensure_state`'s
storage_state cache) does NOT work for this app: confirmed by running
against the live demo-mode dev server — every `page_as("admin")` call came
back still on the login screen, because this app's demo-mode session lives
in in-memory React state, not in a cookie or localStorage key. A storage_state
snapshot captured right after `login()` signs in has nothing in it that says
"signed in" once replayed into a new context, so the replayed context loads
the SPA fresh and it's logged out again. (This likely does NOT affect a
Supabase-backed environment, where `persistSession: true` puts the session
in localStorage — but this repo's dev loop runs demo mode, and `page_as`
needs to work there.)

Given that, every non-AUTH test in this module signs in for itself via
`ensure_signed_in_as_admin()` below rather than going through `page_as`, and
`page_as`/`conftest.login()` are left as-is for a future Supabase-backed run
where they should work as designed.
"""
from __future__ import annotations

from playwright.async_api import Page

from pages.login_page import LoginPage


async def _do_sign_in_as_admin(page: Page) -> None:
    await LoginPage(page).sign_in_as_admin()
    await page.get_by_role("button", name="Overview", exact=True).wait_for()


async def sign_in_as_admin(step, page: Page, occurrence: int = 1) -> None:
    """Evidenced version — for a TC whose own step is literally named "Sign
    in as admin" (AUTH-0001, AUTH-0004).

    Block name must be `engine.stepkey.slug("Sign in as admin")`, i.e.
    exactly "sign_in_as_admin" — step() keys are matched verbatim against
    the TC's own step `key`, never re-slugified at call time.

    `occurrence` is the step's position *within its own block* (the ".N" in
    its key), not its absolute step number in the TC — step() looks the
    absolute `no` up itself from the TC's steps. Leave it at 1 unless this
    TC repeats a "Sign in as admin" block more than once (e.g. re-login
    later in the same scenario)."""
    login_page = LoginPage(page)
    async with step("sign_in_as_admin", occurrence, shot="signed_in",
                     focus=login_page.admin_card()):
        await _do_sign_in_as_admin(page)


async def ensure_signed_in_as_admin(browser, qa_config, step) -> Page:
    """Un-evidenced version — for any TC whose precondition is simply "user
    is signed in as admin" rather than sign-in being the thing under test.
    Opens its own fresh context (see module docstring for why `page_as`
    can't be used here) and returns a page already past the login screen,
    attached to `step` for evidence capture on whatever the TC's own first
    declared step does next."""
    from engine import config as cfg  # local import: avoids a hard
                                       # dependency for callers that only
                                       # need the evidenced sign_in_as_admin

    conf, _ = qa_config
    viewport = cfg.viewports(conf)["desktop"]
    ctx = await browser.new_context(viewport=viewport)
    page = step.attach(await ctx.new_page())
    await page.goto(conf["base_url"], wait_until="domcontentloaded")
    await _do_sign_in_as_admin(page)
    return page


async def ensure_signed_in_as_readonly(browser, qa_config, step) -> Page:
    """Same as ensure_signed_in_as_admin, but for the read-only demo account
    (registry/demoStore.ts's demoReadOnly) — for TRAIN-0006, the only TC
    whose precondition needs a non-admin session. Demo-mode only: see
    conftest.py's login() docstring for what a Supabase-backed run would
    need instead."""
    from engine import config as cfg

    conf, _ = qa_config
    viewport = cfg.viewports(conf)["desktop"]
    ctx = await browser.new_context(viewport=viewport)
    page = step.attach(await ctx.new_page())
    await page.goto(conf["base_url"], wait_until="domcontentloaded")
    email = cfg.resolve_value("$QA_READONLY_EMAIL")
    password = cfg.resolve_value("$QA_READONLY_PASSWORD")
    await LoginPage(page).sign_in_manual(email, password)
    await page.get_by_role("button", name="Overview", exact=True).wait_for()
    return page


async def sign_in_manual(step, page: Page, occurrence: int, email: str,
                          password: str) -> None:
    """Block name "sign_in_manually" — see sign_in_as_admin's note on
    `occurrence` vs. absolute step number."""
    login_page = LoginPage(page)
    async with step("sign_in_manually", occurrence, shot="manual_sign_in",
                     focus=login_page.submit_button()):
        await login_page.sign_in_manual(email, password)
