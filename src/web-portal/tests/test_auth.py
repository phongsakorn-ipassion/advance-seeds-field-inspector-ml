"""tests/test_auth.py — AUTH series: sign-in and sign-out.

Every AUTH TC starts unauthenticated (precondition: "no existing session"),
so these tests open their own fresh, unauthenticated context directly —
`page_as` always means "already signed in" (see conftest.py's
`_on_login_screen`), the wrong fixture for exercising the login screen
itself. This mirrors tests/smoke/test_flows.py's own pattern.

Each `step()` block name is `engine.stepkey.slug(<TC step name>)` verbatim —
see testcases/AUTH.json for the exact names these were derived from. step()
matches block names against the TC's own step `key`, it does not re-slugify.
"""
from __future__ import annotations

import pytest

from engine import config as cfg

from components.topbar import TopBar
from flows.auth_flow import sign_in_as_admin
from pages.login_page import LoginPage

pytestmark = pytest.mark.browser


async def _fresh_unauthenticated_page(step, browser, qa_config):
    conf, _ = qa_config
    viewport = cfg.viewports(conf)["desktop"]
    ctx = await browser.new_context(viewport=viewport)
    page = step.attach(await ctx.new_page())
    await page.goto(conf["base_url"], wait_until="domcontentloaded")
    return page


@pytest.mark.qa_series("AUTH-0001")
async def test_one_click_admin_sign_in(tc, step, browser, qa_config):
    page = await _fresh_unauthenticated_page(step, browser, qa_config)
    login_page = LoginPage(page)

    async with step("open_the_dashboard", 1, shot="login_screen",
                     focus=login_page.admin_card()):
        pass  # navigation already happened above; this step just evidences the landed screen

    await sign_in_as_admin(step, page)


@pytest.mark.qa_series("AUTH-0002")
async def test_manual_sign_in_valid_credentials(tc, step, browser, qa_config):
    page = await _fresh_unauthenticated_page(step, browser, qa_config)
    login_page = LoginPage(page)

    async with step("open_the_dashboard", 1, shot="login_screen",
                     focus=login_page.admin_card()):
        pass

    async with step("switch_to_manual_sign_in", 1, shot="manual_form",
                     focus=login_page.use_different_account_button()):
        await login_page.use_different_account_button().click()

    email = cfg.resolve_value(tc.test_data["email"])
    password = cfg.resolve_value(tc.test_data["password"])
    async with step("enter_the_admin_s_email_and_password_and_submit", 1,
                     shot="signed_in", focus=login_page.submit_button()):
        await login_page.sign_in_manual(email, password)
        await page.get_by_role("button", name="Overview", exact=True).wait_for()


@pytest.mark.qa_series("AUTH-0003")
async def test_manual_sign_in_wrong_password(tc, step, browser, qa_config):
    page = await _fresh_unauthenticated_page(step, browser, qa_config)
    login_page = LoginPage(page)

    async with step("open_the_dashboard", 1, shot="login_screen",
                     focus=login_page.admin_card()):
        pass

    async with step("switch_to_manual_sign_in", 1, shot="manual_form",
                     focus=login_page.use_different_account_button()):
        await login_page.use_different_account_button().click()

    email = cfg.resolve_value(tc.test_data["email"])
    password = tc.test_data["password"]  # intentionally wrong — not a secret
    # No `focus` here: the error message this step produces doesn't exist
    # until the body submits the form — step()'s pre-shot evaluates `focus`
    # *before* the body runs, so focusing on the not-yet-rendered error
    # would time out waiting for it.
    async with step("enter_a_valid_email_with_an_incorrect_password_and_submit", 1,
                     shot="login_rejected"):
        await login_page.sign_in_manual(email, password)
        await login_page.error_message().wait_for()


@pytest.mark.qa_series("AUTH-0004")
async def test_sign_out(tc, step, browser, qa_config):
    page = await _fresh_unauthenticated_page(step, browser, qa_config)
    topbar = TopBar(page)

    await sign_in_as_admin(step, page)

    async with step("sign_out", 1, shot="signed_out",
                     focus=topbar.sign_out_button()):
        await topbar.sign_out()
