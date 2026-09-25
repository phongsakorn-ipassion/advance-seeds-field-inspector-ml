"""tests/smoke/test_flows.py — flow-level smoke test: sign in, tour every section.

qa-build's own proof for the flow layer (independent of any TC series):
walks login -> Overview -> Train -> Models -> Storage and back, reading
nothing more than "did the right screen render" — no form submission, no
deploy/undeploy/delete, safe to run against demo mode or a real
Supabase-backed environment alike.

This app has no distinguishable login URL (sys_summary.md §2 — no
client-side router), so `page_as` (which always means "already
authenticated" — see conftest.py's `_on_login_screen`) is the wrong fixture
for testing the sign-in step itself. This test opens its own fresh,
unauthenticated context instead, the same way conftest.py's own `login()`
does, and drives flows/auth_flow.sign_in_as_admin as a real, evidenced TC
step.

Needs testcases/smoke.json for step-key resolution (qa-build's own fixture
series — see that file's `test_cases.SMOKE-0001.remark` for why it isn't a
product test case):

    pytest tests/smoke/test_flows.py -m browser --qa-data testcases/smoke.json
"""
from __future__ import annotations

import pytest

from engine import config as cfg

from flows import auth_flow, navigation_flow

pytestmark = pytest.mark.browser


@pytest.mark.qa_series("SMOKE")
async def test_sign_in_and_tour_sections(tc, step, browser, qa_config):
    conf, _ = qa_config
    viewport = cfg.viewports(conf)["desktop"]
    ctx = await browser.new_context(viewport=viewport)
    page = step.attach(await ctx.new_page())
    await page.goto(conf["base_url"], wait_until="domcontentloaded")

    await auth_flow.sign_in_as_admin(step, page)
    await navigation_flow.open_overview(step, page)
    await navigation_flow.open_train(step, page)
    await navigation_flow.open_models(step, page)
    await navigation_flow.open_storage(step, page)

    await ctx.close()
