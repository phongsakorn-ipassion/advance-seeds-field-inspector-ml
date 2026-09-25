"""pages/train_page.py — Train pipeline: new-run form, live tracking, recent runs.

Selector correction history (qa-build step 2 says "never trust the
paraphrase, confirm the real accessible name" — this went through two
rounds of that, same root cause as models_page.py's header note):

1. qa-build's manual exploration wrongly read the upload buttons' `title`
   tooltip text ("Upload a YOLO dataset YAML to R2" / "...zipped dataset
   image bundle...") as their accessible name.
2. qa-plan: cross-checked apps/web/src/App.tsx source directly, then
   confirmed empirically (`get_by_role(...).count()` against the live dev
   server). **The buttons' real accessible name is their short visible text
   — "Upload .yaml" / "Upload .zip" — `title` is a tooltip only.**

The Epochs/Image size/Patience/Batch/Source weights/Note fields also turned
out NOT to resolve via `get_by_label()` the way Email/Password/Note-alone
did during qa-build's spot checks: `get_by_label(..., exact=False)` matched
each field's *hint-tooltip trigger button* instead (or, for "Epochs",
ALSO matched "Patience"'s hint text, which happens to contain the word
"epochs"). Confirmed via a throwaway script: `page.locator("form")
.locator("label", has_text=re.compile("^Epochs"))` is what actually
resolves to exactly one element — the `^`-anchored regex matches the
label's own leading text and excludes another field's hint bubble that
merely mentions the word later in a sentence. `field_by_label_prefix()`
below is that pattern, reused for every field below Dataset config/bundle
(those two stay `get_by_placeholder`, which needs no such workaround).

Both upload buttons open a **native file-chooser dialog** from a `<input
type=file>` that is created off-DOM and never attached (sys_summary §8) —
Playwright's `expect_file_chooser()` is the only way to drive it; a locator
query against a page selector will never find that input.
"""
from __future__ import annotations

import re

from playwright.async_api import Page

from components.modal import Modal


class TrainPage:
    def __init__(self, page: Page):
        self.page = page
        self._subnav = page.get_by_role(
            "complementary", name="Train pipeline navigation"
        )
        self._form = page.locator("form").first

    def field_by_label_prefix(self, text: str):
        """The <label> whose own leading text (not a nested hint tooltip
        that happens to mention the same word) starts with `text` — see
        module docstring for why this replaces get_by_label() here."""
        return self._form.locator("label", has_text=re.compile(f"^{re.escape(text)}"))

    # ── sub-nav ──────────────────────────────────────────────────────
    def train_new_model_tab(self):
        return self._subnav.get_by_role(
            "button", name="Train new model", exact=True
        )

    def live_tracking_tab(self):
        return self._subnav.get_by_role("button", name="Live tracking", exact=True)

    def recent_runs_tab(self):
        return self._subnav.get_by_role("button", name="Recent runs", exact=True)

    def how_training_runs_button(self):
        return self._subnav.get_by_role(
            "button", name="How training runs", exact=True
        )

    async def open_train_new_model(self) -> None:
        await self.train_new_model_tab().click()

    async def open_live_tracking(self) -> None:
        await self.live_tracking_tab().click()

    async def open_recent_runs(self) -> None:
        await self.recent_runs_tab().click()

    # ── "Train new model" form ──────────────────────────────────────
    def dataset_config_input(self):
        return self.page.get_by_placeholder(
            "configs/dataset.example.yaml or datasets/seeds-poc/.../file.yaml"
        )

    def upload_dataset_yaml_button(self):
        return self.page.get_by_role("button", name="Upload .yaml", exact=True)

    def dataset_bundle_input(self):
        return self.page.get_by_placeholder("datasets/seeds-poc/.../images.zip")

    def upload_dataset_bundle_button(self):
        return self.page.get_by_role("button", name="Upload .zip", exact=True)

    def source_weights_select(self):
        return self.field_by_label_prefix("Source weights").locator("select")

    def epochs_input(self):
        return self.field_by_label_prefix("Epochs").locator("input")

    def image_size_input(self):
        return self.field_by_label_prefix("Image size").locator("input")

    def advanced_hyperparameters_toggle(self):
        return self.page.get_by_text("Advanced hyperparameters", exact=True)

    def patience_input(self):
        return self.field_by_label_prefix("Patience").locator("input")

    def batch_select(self):
        return self.field_by_label_prefix("Batch").locator("select")

    def note_textarea(self):
        return self.field_by_label_prefix("Note").locator("textarea")

    def ios_export_checkbox(self):
        return self.page.locator("label", has_text="iOS export").locator(
            'input[type="checkbox"]'
        )

    def android_export_checkbox(self):
        return self.page.locator("label", has_text="Android export").locator(
            'input[type="checkbox"]'
        )

    def field_error(self):
        # Confirmed live: a required-field error ("Dataset config is
        # required.") carries BOTH `form-error` and `field-error`, but the
        # dataset-bundle upload's type-rejection error ("Dataset image
        # bundle must be a .zip file.") carries only `form-error` — the two
        # error paths render differently inside this form. `p.form-error`
        # alone covers both without missing the narrower one.
        return self.page.locator("p.form-error")

    def create_run_button(self):
        return self.page.get_by_role("button", name="Create training run", exact=True)

    async def fill_dataset_config(self, path: str) -> None:
        await self.dataset_config_input().fill(path)

    async def fill_dataset_bundle_path(self, path: str) -> None:
        """Types an R2 path directly into the field, bypassing the upload
        button — the field is a plain controlled text input (confirmed live:
        same DOM shape as dataset_config_input), so a typed value satisfies
        the "required" check the same way an upload's resulting value would.
        Use upload_dataset_bundle() instead when the upload interaction
        itself (file-type rejection, etc.) is what the TC is testing."""
        await self.dataset_bundle_input().fill(path)

    async def upload_dataset_yaml(self, file_path: str) -> None:
        async with self.page.expect_file_chooser() as fc_info:
            await self.upload_dataset_yaml_button().click()
        chooser = await fc_info.value
        await chooser.set_files(file_path)

    async def upload_dataset_bundle(self, file_path: str) -> None:
        async with self.page.expect_file_chooser() as fc_info:
            await self.upload_dataset_bundle_button().click()
        chooser = await fc_info.value
        await chooser.set_files(file_path)

    async def select_source_weights(self, value: str) -> None:
        await self.source_weights_select().select_option(value)

    async def submit_create_run(self) -> None:
        await self.create_run_button().click()

    # ── run lists (Live tracking / Recent runs) ─────────────────────
    def run_row(self, run_name: str):
        return self.page.get_by_role("button", name=run_name, exact=False)

    def run_row_wrappers(self):
        # The run's display name is server/app-generated (there is no "run
        # name" field on the create-run form), so a test that just created a
        # run can't look it up by name — index into the row list instead.
        # Confirmed directly in App.tsx: `run-row-wrapper` / `run-row`.
        return self.page.locator("div.run-row-wrapper")

    def run_row_by_index(self, index: int = 0):
        return self.run_row_wrappers().nth(index)

    def delete_run_button(self, run_name: str):
        # aria-label={`Delete ${deleteLabel} run ${run.name}`} (confirmed in
        # App.tsx) — deleteLabel (the state word) varies, so match the
        # accessible name with a regex rather than an exact/substring string
        # (a `has_text` filter would look at rendered text, which is empty
        # for this icon-only button — its label really is an aria-label here).
        return self.page.get_by_role(
            "button", name=re.compile(rf"^Delete .* run {re.escape(run_name)}$")
        )

    def delete_button_in_row(self, index: int = 0):
        """Delete icon-button scoped to a row by position, for a run whose
        generated name isn't known ahead of time (see run_row_by_index)."""
        return self.run_row_by_index(index).get_by_role(
            "button", name=re.compile(r"^Delete ")
        )

    async def open_run(self, run_name: str) -> None:
        await self.run_row(run_name).click()

    async def open_delete_run_modal(self, run_name: str) -> Modal:
        await self.delete_run_button(run_name).click()
        return Modal(self.page)

    async def open_delete_run_modal_by_index(self, index: int = 0) -> Modal:
        await self.delete_button_in_row(index).click()
        return Modal(self.page)

    # ── run detail panel (not yet exercised by any TC — unconfirmed live) ──
    def run_detail_close_button(self):
        return self.page.get_by_role("button", name="Close run detail", exact=True)

    def run_progress(self):
        return self.page.get_by_role("region", name="Run progress")

    def run_logs(self):
        return self.page.get_by_role("region", name="Run logs")

    def metric_toggle(self, metric_name: str):
        return self.page.get_by_role("button", name=metric_name, exact=True)

    def colab_link(self):
        return self.page.get_by_role("link", name="Open in Colab", exact=False)

    async def close_run_detail(self) -> None:
        await self.run_detail_close_button().click()
