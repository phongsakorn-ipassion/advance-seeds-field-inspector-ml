"""flows/navigation_flow.py — move between the app's four sections.

Read-only: opens each section and returns text a caller can assert on, never
submits or mutates anything. This is the flow qa-build's own smoke test
(`tests/smoke/test_flows.py`) exercises, since it needs no test data and is
safe to run against a live Supabase-backed environment as well as demo mode.

Each function's `step()` block name is `engine.stepkey.slug(<TC step name>)`
verbatim (e.g. "Open overview" -> "open_overview") — step() matches block
names against the TC's own step `key` exactly, it does not re-slugify. The
`occurrence` argument is the step's position *within its own block* (almost
always 1 — it is not the step's absolute position in the TC, which step()
looks up itself from the TC's steps).
"""
from __future__ import annotations

from playwright.async_api import Page

from components.topbar import TopBar


async def open_overview(step, page: Page, occurrence: int = 1) -> None:
    topbar = TopBar(page)
    async with step("open_overview", occurrence, shot="overview",
                     focus=topbar.nav_button("Overview")):
        await topbar.goto_overview()


async def open_train(step, page: Page, occurrence: int = 1) -> None:
    topbar = TopBar(page)
    async with step("open_train", occurrence, shot="train",
                     focus=topbar.nav_button("Train")):
        await topbar.goto_train()


async def open_models(step, page: Page, occurrence: int = 1) -> None:
    topbar = TopBar(page)
    async with step("open_models", occurrence, shot="models",
                     focus=topbar.nav_button("Models")):
        await topbar.goto_models()


async def open_storage(step, page: Page, occurrence: int = 1) -> None:
    topbar = TopBar(page)
    async with step("open_storage", occurrence, shot="storage",
                     focus=topbar.nav_button("Storage")):
        await topbar.goto_storage()
