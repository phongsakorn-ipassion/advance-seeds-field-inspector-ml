"""pages/login_page.py — the one screen this app reaches when unauthenticated.

This app has **no client-side router** (sys_summary.md §2): the login screen
and every authenticated screen live at the same URL. `is_showing()` is
therefore the only reliable "are we logged out" signal, and conftest.py's
`page_as` fixture uses it (via `LOGIN_MARKER_ROLE`/`LOGIN_MARKER_NAME` below)
instead of the URL-substring check the qaplay template ships with — see the
comment on `_on_login_screen` in conftest.py for why.
"""
from __future__ import annotations

from playwright.async_api import Page

# The admin one-click button is present in both demo and Supabase-backed
# modes (it's rendered by LoginScreen regardless of which store backs it),
# so it's a safe, mode-independent marker for "we are on the login screen".
LOGIN_MARKER_ROLE = "button"
LOGIN_MARKER_NAME = "Sign in as Admin"


class LoginPage:
    def __init__(self, page: Page):
        self.page = page

    def admin_card(self):
        # Accessible name concatenates the card's child text nodes
        # ("Sign in as Admin" + the preset email) — match by substring.
        return self.page.get_by_role(
            LOGIN_MARKER_ROLE, name=LOGIN_MARKER_NAME, exact=False
        )

    def use_different_account_button(self):
        return self.page.get_by_role(
            "button", name="Use a different account", exact=True
        )

    def email_input(self):
        return self.page.get_by_label("Email", exact=True)

    def password_input(self):
        return self.page.get_by_label("Password", exact=True)

    def submit_button(self):
        return self.page.get_by_role("button", name="Sign in", exact=True)

    def cancel_button(self):
        return self.page.get_by_role("button", name="Cancel", exact=True)

    def error_message(self):
        # No accessible role/name carries this text — it's a plain <p> shown
        # only in the manual-login form. `p.form-error` is a stable, static
        # class (sys_summary.md §6), not one of the dynamically-composed ones.
        return self.page.locator("p.form-error")

    async def is_showing(self) -> bool:
        return await self.admin_card().count() > 0

    async def sign_in_as_admin(self) -> None:
        await self.admin_card().click()

    async def sign_in_manual(self, email: str, password: str) -> None:
        if await self.use_different_account_button().count() > 0:
            await self.use_different_account_button().click()
        await self.email_input().fill(email)
        await self.password_input().fill(password)
        await self.submit_button().click()
