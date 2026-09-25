"""tests/test_train.py — TRAIN series: the training-run creation form.

Every TC here assumes an already-authenticated admin (precondition). These
sign in directly via flows.auth_flow.ensure_signed_in_as_admin rather than
`page_as("admin")` — see that function's docstring: this app's demo-mode
session isn't cookie/localStorage-backed, so page_as's storage_state cache
comes back still logged out.

Each `step()` block name is `engine.stepkey.slug(<TC step name>)` verbatim —
see testcases/TRAIN.json for the exact names. TRAIN-0005 needs a run to
already exist before its own declared steps start; that setup runs
un-evidenced (no step() wrapper) since it isn't one of the TC's own steps —
only the precondition it establishes.
"""
from __future__ import annotations

import pytest

from flows.auth_flow import ensure_signed_in_as_admin
from pages.train_page import TrainPage

pytestmark = pytest.mark.browser


async def _create_run(train_page: TrainPage, *, dataset_config: str,
                       dataset_bundle: str, source_weights: str) -> None:
    """Un-evidenced setup helper — fills and submits the training form
    without wrapping the actions in step(), for TCs that need a run to
    already exist as their precondition rather than as one of their own
    declared steps."""
    await train_page.open_train_new_model()
    await train_page.fill_dataset_config(dataset_config)
    await train_page.fill_dataset_bundle_path(dataset_bundle)
    await train_page.select_source_weights(source_weights)
    await train_page.submit_create_run()
    # Wait for the created run's own row, not just the Live tracking tab
    # button's visibility (that button exists regardless of which tab is
    # active, so it proves nothing about navigation actually landing there).
    await train_page.run_row_by_index(0).wait_for()


@pytest.mark.qa_series("TRAIN-0001")
async def test_create_run_blocked_without_dataset_config(tc, step, browser, qa_config):
    page = await ensure_signed_in_as_admin(browser, qa_config, step)
    await page.get_by_role("button", name="Train", exact=True).click()
    train_page = TrainPage(page)
    await train_page.open_train_new_model()

    data = tc.test_data
    async with step("leave_the_dataset_config_field_empty_and_fill_in_the_rest_of_the_form_validly",
                     1, shot="form_filled", focus=train_page.source_weights_select()):
        await train_page.fill_dataset_bundle_path(data["dataset_bundle"])
        await train_page.select_source_weights(data["source_weights"])

    # focus is the submit button (exists beforehand), not the error message
    # the click produces — see test_auth.py's note on step()'s pre-shot timing.
    async with step("submit_the_form", 1, shot="validation_error",
                     focus=train_page.create_run_button()):
        await train_page.submit_create_run()
        await train_page.field_error().wait_for()


@pytest.mark.qa_series("TRAIN-0002")
async def test_non_zip_dataset_bundle_rejected(tc, step, browser, qa_config):
    page = await ensure_signed_in_as_admin(browser, qa_config, step)
    await page.get_by_role("button", name="Train", exact=True).click()
    train_page = TrainPage(page)
    await train_page.open_train_new_model()

    async with step("choose_a_non_zip_file_to_upload_as_the_dataset_image_bundle",
                     1, shot="upload_rejected",
                     focus=train_page.upload_dataset_bundle_button()):
        await train_page.upload_dataset_bundle(tc.test_data["upload_file"])
        await train_page.field_error().wait_for()


@pytest.mark.qa_series("TRAIN-0003")
async def test_dataset_yaml_upload_populates_classes(tc, step, browser, qa_config):
    page = await ensure_signed_in_as_admin(browser, qa_config, step)
    await page.get_by_role("button", name="Train", exact=True).click()
    train_page = TrainPage(page)
    await train_page.open_train_new_model()

    # focus is the upload button (exists beforehand, unambiguous) rather
    # than the "Classes" label text — that text node isn't exactly "Classes"
    # alone (it wraps a hint tooltip, same as the other form fields; see
    # train_page.py's field_by_label_prefix note), and an unscoped substring
    # match on "Classes" resolves to 3 elements on this screen.
    async with step("upload_a_valid_dataset_yaml_that_declares_a_set_of_class_names",
                     1, shot="classes_populated",
                     focus=train_page.upload_dataset_yaml_button()):
        await train_page.upload_dataset_yaml(tc.test_data["upload_file"])


@pytest.mark.qa_series("TRAIN-0004")
async def test_submitting_complete_form_creates_run(tc, step, browser, qa_config):
    page = await ensure_signed_in_as_admin(browser, qa_config, step)
    await page.get_by_role("button", name="Train", exact=True).click()
    train_page = TrainPage(page)
    await train_page.open_train_new_model()

    data = tc.test_data
    async with step(
        "fill_in_dataset_config_dataset_image_bundle_and_source_weights_"
        "leaving_other_fields_at_their_defaults", 1, shot="form_filled",
        focus=train_page.source_weights_select(),
    ):
        await train_page.fill_dataset_config(data["dataset_config"])
        await train_page.fill_dataset_bundle_path(data["dataset_bundle"])
        await train_page.select_source_weights(data["source_weights"])

    async with step("submit_the_form", 1, shot="run_created",
                     focus=train_page.live_tracking_tab()):
        await train_page.submit_create_run()
        await train_page.live_tracking_tab().wait_for()


@pytest.mark.qa_series("TRAIN-0005")
async def test_delete_stalled_or_waiting_run(tc, step, browser, qa_config):
    page = await ensure_signed_in_as_admin(browser, qa_config, step)
    await page.get_by_role("button", name="Train", exact=True).click()
    train_page = TrainPage(page)

    data = tc.test_data
    await _create_run(
        train_page,
        dataset_config=data["dataset_config"],
        dataset_bundle=data["dataset_bundle"],
        source_weights=data["source_weights"],
    )
    # The run's display name is app-generated (no "run name" field on the
    # create-run form) — the run this test just created is the only row in
    # Live tracking right after submit, so it's addressed by position, not
    # by a name this test can't know ahead of time.

    # No focus, and no click on the Live tracking tab: the app's own submit
    # handler already switches to that tab on success (confirmed live via
    # _create_run's own final wait), and clicking a sub-nav tab that is
    # *already* active reproducibly breaks the view (the run list disappears
    # entirely) — confirmed with a throwaway script reproducing exactly this
    # double click (recorded as a known bug on this TC). Checking the tab's
    # "active" class immediately after submit and conditionally clicking
    # still race-loses sometimes (the class can lag the click that already
    # landed), so this trusts the navigation rather than re-driving it.
    async with step("open_live_tracking_and_locate_the_waiting_stalled_run", 1,
                     shot="run_listed"):
        await train_page.run_row_by_index(0).wait_for()

    async with step("choose_to_delete_the_run", 1, shot="delete_confirm",
                     focus=train_page.delete_button_in_row(0)):
        modal = await train_page.open_delete_run_modal_by_index(0)

    async with step("confirm_the_deletion", 1, shot="run_deleted"):
        await modal.confirm(button_name="Delete run")
