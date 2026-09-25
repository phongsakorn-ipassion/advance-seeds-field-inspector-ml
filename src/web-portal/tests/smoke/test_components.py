"""tests/smoke/test_components.py — page-object locators vs. real markup.

Component-level smoke test (qa-build's own proof, independent of any TC
series): serves static captures of the real rendered DOM
(tests/fixtures/*.html — see their own header comments for provenance) and
checks that every locator pages/ and components/ define actually resolves.

No qaplay involved on purpose — no `step`, no `--qa-data`. A plain Playwright
`page` fixture against local HTML is enough to catch a renamed class or a
dropped aria-label without needing the dev server or a backend.

    pytest tests/smoke/test_components.py -m browser
"""
from __future__ import annotations

import functools
import http.server
import sys
import threading
from pathlib import Path

import pytest
from playwright.async_api import async_playwright

MODULE_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(MODULE_ROOT))

from components.topbar import TopBar  # noqa: E402
from pages.login_page import LoginPage  # noqa: E402
from pages.overview_page import OverviewPage  # noqa: E402

FIXTURES_DIR = Path(__file__).resolve().parent.parent / "fixtures"

pytestmark = pytest.mark.browser


@pytest.fixture(scope="module")
def fixtures_server():
    handler = functools.partial(
        http.server.SimpleHTTPRequestHandler, directory=str(FIXTURES_DIR)
    )
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{server.server_address[1]}"
    server.shutdown()


@pytest.fixture
async def page():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch()
        ctx = await browser.new_context()
        pg = await ctx.new_page()
        yield pg
        await browser.close()


async def test_login_page_locators_resolve(page, fixtures_server):
    await page.goto(f"{fixtures_server}/login_screen.html")
    login_page = LoginPage(page)

    assert await login_page.is_showing()
    assert await login_page.admin_card().count() == 1
    assert await login_page.use_different_account_button().count() == 0  # \
        # not present once the manual form is already expanded (this fixture)
    assert await login_page.email_input().count() == 1
    assert await login_page.password_input().count() == 1
    assert await login_page.submit_button().count() == 1
    assert await login_page.cancel_button().count() == 1


async def test_topbar_locators_resolve(page, fixtures_server):
    await page.goto(f"{fixtures_server}/authenticated_shell.html")
    topbar = TopBar(page)

    for section in ("Overview", "Train", "Models", "Storage"):
        assert await topbar.nav_button(section).count() == 1
    assert await topbar.notifications_bell().count() == 1
    assert await topbar.sign_out_button().count() == 1


async def test_overview_page_locators_resolve(page, fixtures_server):
    await page.goto(f"{fixtures_server}/authenticated_shell.html")
    overview = OverviewPage(page)

    for label in ("Production", "Staging", "Training", "R2 storage"):
        assert await overview.metric_card(label).count() == 1
    assert await overview.start_training_button().count() == 1
    assert await overview.live_runs_empty_state().count() == 1
