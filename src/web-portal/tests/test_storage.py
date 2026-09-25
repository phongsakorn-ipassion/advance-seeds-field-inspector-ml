"""tests/test_storage.py — STORAGE series: R2 quota and artifact cleanup.

Every TC assumes an already-authenticated admin on the Storage screen —
these sign in directly via flows.auth_flow.ensure_signed_in_as_admin
rather than `page_as("admin")` (see that function's docstring for why).

Each `step()` block name is `engine.stepkey.slug(<TC step name>)` verbatim —
see testcases/STORAGE.json for the exact names.
"""
from __future__ import annotations

import pytest

from flows.auth_flow import ensure_signed_in_as_admin
from pages.storage_page import StoragePage

pytestmark = pytest.mark.browser


@pytest.mark.qa_series("STORAGE-0001")
async def test_quota_banner_reflects_usage(tc, step, browser, qa_config):
    page = await ensure_signed_in_as_admin(browser, qa_config, step)
    storage_page = StoragePage(page)

    # No focus: the banner this step locates doesn't exist until the body
    # navigates to Storage — see test_auth.py's note on step()'s pre-shot
    # timing (it evaluates `focus` before the body runs).
    async with step("open_the_storage_screen", 1, shot="quota_banner"):
        await page.get_by_role("button", name="Storage", exact=True).click()
        await storage_page.quota_banner_text().wait_for()


@pytest.mark.qa_series("STORAGE-0002")
async def test_delete_blocked_for_active_artifact(tc, step, browser, qa_config):
    page = await ensure_signed_in_as_admin(browser, qa_config, step)
    storage_page = StoragePage(page)
    await page.get_by_role("button", name="Storage", exact=True).click()

    r2_key = tc.test_data["r2_key"]
    async with step("locate_the_active_artifact_s_row_and_its_delete_action", 1,
                     shot="delete_disabled",
                     focus=storage_page.delete_button(r2_key)):
        await storage_page.row(r2_key).wait_for()
        await storage_page.delete_button(r2_key).wait_for()


@pytest.mark.qa_series("STORAGE-0003")
async def test_delete_inactive_artifact(tc, step, browser, qa_config):
    page = await ensure_signed_in_as_admin(browser, qa_config, step)
    storage_page = StoragePage(page)
    await page.get_by_role("button", name="Storage", exact=True).click()

    r2_key = tc.test_data["r2_key"]
    async with step("locate_the_inactive_artifact_s_row_and_choose_to_delete_it", 1,
                     shot="delete_confirm",
                     focus=storage_page.delete_button(r2_key)):
        modal = await storage_page.open_delete_modal(r2_key)

    async with step("confirm_the_deletion", 1, shot="deleted"):
        await modal.confirm(button_name="Delete model")


@pytest.mark.qa_series("STORAGE-0004")
async def test_open_model_shortcut(tc, step, browser, qa_config):
    page = await ensure_signed_in_as_admin(browser, qa_config, step)
    storage_page = StoragePage(page)
    await page.get_by_role("button", name="Storage", exact=True).click()

    r2_key = tc.test_data["r2_key"]
    async with step("choose_the_open_model_shortcut_on_any_artifact_row", 1,
                     shot="model_opened",
                     focus=storage_page.open_model_button(r2_key)):
        await storage_page.open_model_button(r2_key).click()
