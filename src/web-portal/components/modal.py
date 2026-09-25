"""components/modal.py — the generic confirm/action dialog used across the app.

Every write action (deploy, undeploy, set default, delete run, delete model,
delete storage artifact) opens the same `role="dialog"` wrapper with a title
(exposed as the dialog's accessible name), a body paragraph, a "Cancel"
button and one primary confirm button whose visible text is the action name.

Confirmed directly in App.tsx: `<div role="dialog" aria-modal="true"
aria-label={title} ...>` — the dialog's own `title` prop becomes its
aria-label. The title text varies per action ("Deploy to staging", "Set
staging default", "Delete model", "Delete model storage", ...) and, for
several actions, differs from the *button* that opened it (see
models_page.py's header for the confirmed mapping) — callers pass the
expected title rather than this component hardcoding one.
"""
from __future__ import annotations

import re

from playwright.async_api import Locator, Page


class Modal:
    def __init__(self, page: Page, *, title: str | None = None):
        self.page = page
        # `role="dialog"` — filter by accessible name (aria-label) when the
        # caller knows the expected title; otherwise take whichever dialog is
        # open (there is only ever one at a time in this app).
        self.root: Locator = (
            page.get_by_role("dialog", name=title)
            if title
            else page.get_by_role("dialog")
        )

    def is_open(self) -> Locator:
        return self.root

    def body_text(self) -> Locator:
        # The body paragraph has no stable class/role beyond being the first
        # non-heading text node in the dialog; scope to the dialog and read
        # its text via Playwright's own text extraction rather than a brittle
        # nth-child selector.
        return self.root

    async def confirm(self, *, button_name: str) -> None:
        """Click the primary action button — its visible text names the
        action (e.g. "Deploy to production", "Delete run"), which also
        protects against clicking the wrong dialog's button if two
        similarly-titled confirmations exist across a test.

        Note the confirm button's wording does not always echo the dialog
        title verbatim — confirmed live: the "Set {channel} default" dialog's
        confirm button reads just "Set default"."""
        await self.root.get_by_role("button", name=button_name, exact=True).click()

    async def confirm_matching(self, *, prefix: str) -> None:
        """Prefix-match variant of confirm(), for a confirm button whose
        exact wording depends on state (e.g. the delete confirmation's button
        text differs by what exactly is being deleted)."""
        await self.root.get_by_role(
            "button", name=re.compile(f"^{re.escape(prefix)}")
        ).click()

    async def cancel(self) -> None:
        await self.root.get_by_role("button", name="Cancel", exact=True).click()

    async def close(self) -> None:
        await self.root.get_by_role("button", name="Close", exact=True).click()
