"""tests/test_models.py — MODELS series: version lifecycle and deployment.

Every TC assumes an already-authenticated admin on the Models screen — these
sign in directly via flows.auth_flow.ensure_signed_in_as_admin rather than
`page_as("admin")` (see that function's docstring for why: this app's
demo-mode session isn't cookie/localStorage-backed). MODELS-0003 needs a
precondition this repo's demo fixture doesn't start in ("a version deployed
but not default") — that setup runs un-evidenced before the TC's own
declared steps begin, same pattern as TRAIN-0005's run creation.

Each `step()` block name is `engine.stepkey.slug(<TC step name>)` verbatim —
see testcases/MODELS.json for the exact names.
"""
from __future__ import annotations

import pytest

from flows.auth_flow import ensure_signed_in_as_admin
from pages.models_page import ModelsPage

pytestmark = pytest.mark.browser


@pytest.mark.qa_series("MODELS-0001")
async def test_filter_by_channel(tc, step, browser, qa_config):
    page = await ensure_signed_in_as_admin(browser, qa_config, step)
    models_page = ModelsPage(page)
    await page.get_by_role("button", name="Models", exact=True).click()

    staging, archived = tc.test_data["channels"]

    async with step("choose_the_staging_filter", 1, shot="staging_filtered",
                     focus=models_page.channel_filter()):
        await models_page.channel_filter().select_option(staging)

    async with step("choose_the_archived_filter", 1, shot="archived_filtered",
                     focus=models_page.channel_filter()):
        await models_page.channel_filter().select_option(archived)


@pytest.mark.qa_series("MODELS-0002")
async def test_deploy_candidate_version(tc, step, browser, qa_config):
    page = await ensure_signed_in_as_admin(browser, qa_config, step)
    models_page = ModelsPage(page)
    await page.get_by_role("button", name="Models", exact=True).click()

    data = tc.test_data
    version, channel = data["version"], data["channel"]

    async with step("select_the_undeployed_version", 1, shot="version_selected",
                     focus=models_page.version_card(version)):
        await models_page.select_version(version)

    deploy_button = (models_page.deploy_to_prod_button() if channel == "production"
                     else models_page.deploy_to_staging_button())
    async with step("choose_to_deploy_it_to_a_channel", 1, shot="deploy_confirm",
                     focus=deploy_button):
        modal = await models_page.open_deploy_modal(channel)

    async with step("confirm_the_deployment", 1, shot="deployed"):
        await modal.confirm(button_name=f"Deploy to {channel}")


@pytest.mark.qa_series("MODELS-0003")
async def test_make_deployed_version_default(tc, step, browser, qa_config):
    page = await ensure_signed_in_as_admin(browser, qa_config, step)
    models_page = ModelsPage(page)
    await page.get_by_role("button", name="Models", exact=True).click()

    data = tc.test_data
    version, channel = data["version"], data["channel"]

    # Precondition setup (un-evidenced): deploy the candidate as a
    # non-default selectable version first, so it's in the "deployed but
    # not default" state this TC's own steps assume.
    await models_page.select_version(version)
    setup_modal = await models_page.open_deploy_modal(channel)
    await setup_modal.confirm(button_name=f"Deploy to {channel}")

    async with step("select_the_non_default_deployed_version", 1,
                     shot="version_selected",
                     focus=models_page.version_card(version)):
        await models_page.select_version(version)

    async with step("choose_to_make_it_the_channel_default", 1, shot="made_default",
                     focus=models_page.set_default_button(channel)):
        modal = await models_page.open_make_default_modal(channel)
        await modal.confirm(button_name="Set default")


@pytest.mark.qa_series("MODELS-0004")
async def test_undeploy_version(tc, step, browser, qa_config):
    page = await ensure_signed_in_as_admin(browser, qa_config, step)
    models_page = ModelsPage(page)
    await page.get_by_role("button", name="Models", exact=True).click()

    data = tc.test_data
    version, channel = data["version"], data["channel"]

    async with step("select_the_deployed_version", 1, shot="version_selected",
                     focus=models_page.version_card(version)):
        await models_page.select_version(version)

    async with step("choose_to_undeploy_from_the_channel", 1, shot="undeploy_confirm",
                     focus=models_page.undeploy_button(channel)):
        modal = await models_page.open_undeploy_modal(channel)

    async with step("confirm_the_undeploy", 1, shot="undeployed"):
        await modal.confirm(button_name=f"Undeploy from {channel}")


@pytest.mark.qa_series("MODELS-0005")
async def test_delete_blocked_while_deployed(tc, step, browser, qa_config):
    page = await ensure_signed_in_as_admin(browser, qa_config, step)
    models_page = ModelsPage(page)
    await page.get_by_role("button", name="Models", exact=True).click()

    version = tc.test_data["version"]

    # No focus: delete_button() would resolve against whatever version is
    # selected by default on page load, not `version` — which the body only
    # selects once it runs (step()'s pre-shot evaluates focus beforehand).
    async with step("select_the_deployed_version_and_locate_the_delete_action", 1,
                     shot="delete_disabled"):
        await models_page.select_version(version)
        await models_page.delete_button().wait_for()


@pytest.mark.qa_series("MODELS-0006")
async def test_delete_undeployed_version(tc, step, browser, qa_config):
    page = await ensure_signed_in_as_admin(browser, qa_config, step)
    models_page = ModelsPage(page)
    await page.get_by_role("button", name="Models", exact=True).click()

    version = tc.test_data["version"]

    # No focus — same reasoning as MODELS-0005 above.
    async with step("select_the_undeployed_version_and_choose_to_delete_it", 1,
                     shot="delete_confirm"):
        await models_page.select_version(version)
        modal = await models_page.open_delete_modal()

    async with step("confirm_the_deletion", 1, shot="deleted"):
        await modal.confirm(button_name="Delete model")


@pytest.mark.qa_series("MODELS-0007")
async def test_rename_to_duplicate_name_rejected(tc, step, browser, qa_config):
    page = await ensure_signed_in_as_admin(browser, qa_config, step)
    models_page = ModelsPage(page)
    await page.get_by_role("button", name="Models", exact=True).click()

    data = tc.test_data
    version, duplicate_name = data["version"], data["duplicate_name"]
    await models_page.select_version(version)

    async with step("select_a_version_and_start_renaming_it", 1, shot="rename_form",
                     focus=models_page.rename_button()):
        await models_page.rename_button().click()
        await models_page.rename_input().wait_for()

    async with step("enter_the_exact_name_of_a_different_existing_version_and_save", 1,
                     shot="rename_rejected", focus=models_page.rename_input()):
        await models_page.rename_input().fill(duplicate_name)
        await models_page.rename_save_button().click()
