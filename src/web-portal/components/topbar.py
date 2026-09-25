"""components/topbar.py — the nav bar present on every authenticated screen.

Confirmed live: `nav` has no accessible name of its own, but its parent
`banner` does ("Model registry navigation"); the four section buttons expose
their own visible text as accessible name and need no scoping beyond that
(there is exactly one "Overview"/"Train"/"Models"/"Storage" button on the
page). The active tab gets a dynamically-appended `active` class — do not
select on it (sys_summary.md §6).
"""
from __future__ import annotations

from playwright.async_api import Page


class TopBar:
    def __init__(self, page: Page):
        self.page = page

    def nav_button(self, section: str):
        return self.page.get_by_role("button", name=section, exact=True)

    async def goto_overview(self) -> None:
        await self.nav_button("Overview").click()

    async def goto_train(self) -> None:
        await self.nav_button("Train").click()

    async def goto_models(self) -> None:
        await self.nav_button("Models").click()

    async def goto_storage(self) -> None:
        await self.nav_button("Storage").click()

    def notifications_bell(self):
        # Label carries a dynamic unread count ("Activity notifications, 3
        # unread") — match by prefix, not exact string.
        return self.page.get_by_role(
            "button", name="Activity notifications", exact=False
        )

    def sign_out_button(self):
        return self.page.get_by_role("button", name="Sign out", exact=True)

    async def sign_out(self) -> None:
        await self.sign_out_button().click()
