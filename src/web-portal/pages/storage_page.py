"""pages/storage_page.py — Storage: R2 quota banner + per-artifact rows.

Each artifact (not each model version) gets its own row — a version with
three exported files (tflite/mlpackage.zip/.pt) shows three rows sharing the
same semver text. `article.storage-row` confirmed directly in
apps/web/src/App.tsx (StorageWorkflow).

Selector correction (qa-plan, cross-checked against source + confirmed
empirically — see models_page.py's header for how this was caught): the
per-row delete button's real accessible name is its visible text, always
"Delete model" regardless of state — NOT the `title` tooltip that explains
*why* it's disabled ("Undeploy this model before deleting it" /
"Admin role required"). Scope by row (r2_key) to disambiguate between rows,
since every row's button shares that same text.

The confirmation dialog is its own separate case: title "Delete model
storage", confirm button "Delete model" (source: StorageWorkflow's
pendingDelete Modal) — same confirm text as the row's own trigger button,
but in a different DOM subtree (Modal.root), so no collision.
"""
from __future__ import annotations

import re

from playwright.async_api import Page

from components.modal import Modal


class StoragePage:
    def __init__(self, page: Page):
        self.page = page

    def quota_banner_text(self):
        return self.page.get_by_text(re.compile(r"used$"))

    def over_quota_warning(self):
        return self.page.get_by_text("Over quota. Delete inactive model records.")

    def row(self, r2_key: str):
        """r2_key is the artifact's full R2 path, e.g.
        'runs/run-seeds-v2-041/1.0.0-seeds-v2.tflite' — unique per row,
        unlike the semver alone which repeats across a version's artifacts."""
        return self.page.locator("article.storage-row", has_text=r2_key)

    def open_model_button(self, r2_key: str):
        """Scoped to a single row by r2_key, not by semver — a version with
        multiple exported artifacts (tflite/mlpackage.zip/.pt) has one row
        per artifact, all sharing the same "Open model {semver}" button
        text/aria-label, so a semver-only lookup is ambiguous. Confirmed
        live as a real "strict mode violation: resolved to 2 elements"."""
        return self.row(r2_key).get_by_role(
            "button", name=re.compile(r"^Open model ")
        )

    def delete_button(self, r2_key: str):
        return self.row(r2_key).get_by_role("button", name="Delete model", exact=True)

    async def open_delete_modal(self, r2_key: str) -> Modal:
        await self.delete_button(r2_key).click()
        return Modal(self.page, title="Delete model storage")
