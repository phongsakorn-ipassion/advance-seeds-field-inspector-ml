"""pages/overview_page.py — the landing screen after login.

Four metric cards (Production / Staging / Training / R2 storage) and a "Live
runs" panel. Confirmed live: cards are plain `article` elements with no
individual aria-label — read them by the heading text inside each (sys_summary
§3/§6 already flagged these as text-content reads, not selector targets).
"""
from __future__ import annotations

from playwright.async_api import Page


class OverviewPage:
    def __init__(self, page: Page):
        self.page = page

    def metric_card(self, label: str):
        """label is one of Production / Staging / Training / R2 storage."""
        return self.page.locator("article", has_text=label).first

    def start_training_button(self):
        return self.page.get_by_role("button", name="Start training", exact=True)

    async def click_start_training(self) -> None:
        await self.start_training_button().click()

    def live_runs_empty_state(self):
        return self.page.get_by_text("No live runs", exact=True)

    def live_run_row(self, run_name: str):
        return self.page.get_by_role("button", name=run_name, exact=False)

    async def open_run(self, run_name: str) -> None:
        await self.live_run_row(run_name).click()
