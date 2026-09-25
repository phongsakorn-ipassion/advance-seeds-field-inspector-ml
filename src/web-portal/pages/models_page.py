"""pages/models_page.py — Models (lifecycle): version list + model detail.

Selector corrections history (qa-build step 2 says "never trust the
paraphrase, confirm the real accessible name" — this went through two
rounds of that):

1. First pass (qa-build) wrongly assumed the lifecycle buttons' `title`
   attribute WAS their accessible name (based on misreading the Claude
   Browser MCP's own accessibility-tree display during manual exploration).
2. Second pass (qa-plan, this file): cross-checked directly against
   apps/web/src/App.tsx source, then confirmed empirically with a throwaway
   Playwright script (`get_by_role("button", name=...).count()`) against the
   live demo-mode dev server. **The buttons only have a `title` tooltip —
   their real accessible name is their visible button text (content wins
   over `title` in accessible-name computation whenever content exists).**
   `count()` was 0 for every `title`-based guess and 1 for the visible text.

Confirmed button texts (source: App.tsx's ModelDetail/DescriptionSection):
  - "Deploy to Prod" / "Deploy to Staging"      (deploy; hidden once already on that channel)
  - "Undeploy {channel}"                        (e.g. "Undeploy staging" — no "from")
  - "Set {channel} default"                     (e.g. "Set staging default")
  - "Delete model"                              (always this text; `title` explains why it's
                                                   disabled, doesn't change the text)
  - "Add note" / "Edit"                          (description button; text depends on whether
                                                   a description already exists)

Confirmation-dialog title/confirm wording (source: ModelDetail's `askDeploy`
/`askUndeploy`/`askSetDefault`/`askDelete`, cross-checked live) does NOT
always match the button text that opened it:
  - Deploy:      dialog title "Deploy to {channel}",   confirm "Deploy to {channel}"
  - Undeploy:    dialog title "Undeploy from {channel}", confirm "Undeploy from {channel}"
  - Set default: dialog title "Set {channel} default",  confirm just "Set default"
  - Delete:      dialog title "Delete model",            confirm "Delete model"
    (askDelete() itself is a no-op while blocked, so this dialog never opens
    in the blocked state — no alternate wording to handle.)

The inline rename form (opened by "Rename version") has no accessible label
on its text input — it's `<form class="detail-rename-form"><input
class="detail-rename-input">...`. Scoped by that static, intentional form
class (locator-robustness tier 4), not a role/label lookup.
"""
from __future__ import annotations

import re

from playwright.async_api import Page

from components.modal import Modal


class ModelsPage:
    def __init__(self, page: Page):
        self.page = page

    # ── version list ─────────────────────────────────────────────────
    def channel_filter(self):
        # get_by_label("Channel") does NOT resolve here — confirmed
        # empirically (count=0) despite a simple <label><span>Channel</span>
        # <select> structure with no nested hint button. Same workaround as
        # train_page.py's form fields: scope by the label's own text, then
        # reach the control directly.
        return self.page.locator("label", has_text="Channel").locator("select")

    def sort_select(self):
        return self.page.locator("label", has_text="Sort").locator("select")

    def version_card(self, semver: str):
        # Scoped to .version-list (confirmed in App.tsx): an unscoped
        # page-wide lookup collides with the activity-toast notifications
        # the demo ticker pops up, which also mention the semver in their
        # own message text (e.g. "Model version ready 1.0.4--042") and are
        # themselves clickable buttons — confirmed empirically as a real
        # "strict mode violation: resolved to 2 elements" failure.
        return self.page.locator(".version-list").get_by_role(
            "button", name=semver, exact=False
        )

    async def select_version(self, semver: str) -> None:
        await self.version_card(semver).click()

    def empty_state(self):
        return self.page.get_by_text("No matching versions", exact=True)

    # ── model detail ─────────────────────────────────────────────────
    def rename_button(self):
        return self.page.get_by_role("button", name="Rename version", exact=True)

    def rename_form(self):
        return self.page.locator("form.detail-rename-form")

    def rename_input(self):
        return self.rename_form().locator("input.detail-rename-input")

    def rename_save_button(self):
        return self.rename_form().get_by_role("button", name="Save", exact=True)

    def rename_cancel_button(self):
        return self.rename_form().get_by_role("button", name="Cancel", exact=True)

    async def rename_version(self, new_name: str) -> None:
        await self.rename_button().click()
        await self.rename_input().fill(new_name)
        await self.rename_save_button().click()

    def add_or_edit_note_button(self):
        """Text is "Add note" when the version has no description yet,
        "Edit" once it does — match either."""
        return self.page.get_by_role(
            "button", name=re.compile(r"^(Add note|Edit)$")
        )

    def description_textarea(self):
        # No <label> association (confirmed live) — matched by its
        # placeholder text, which is stable prose, not app-generated data.
        return self.page.get_by_placeholder(
            "Notes about this version — purpose, validation context, "
            "anything worth remembering."
        )

    def _description_form(self):
        # No form/section wrapper class was confirmed for this block — walk
        # up from the textarea (the one unambiguous anchor) to its immediate
        # parent, which holds the Save/Cancel pair. Scoping here (rather than
        # a page-wide "Save" lookup) avoids colliding with rename_form()'s
        # own same-named buttons if both were ever open at once.
        return self.description_textarea().locator("xpath=..")

    def description_save_button(self):
        return self._description_form().get_by_role("button", name="Save", exact=True)

    def description_cancel_button(self):
        return self._description_form().get_by_role("button", name="Cancel", exact=True)

    async def set_description(self, text: str) -> None:
        if await self.add_or_edit_note_button().count() > 0:
            await self.add_or_edit_note_button().click()
        await self.description_textarea().fill(text)
        await self.description_save_button().click()

    def download_button(self, artifact: str):
        """artifact is one of 'Android runtime' / 'iOS runtime' / 'Local QA weights'."""
        return self.page.get_by_role(
            "button", name=f"Download {artifact}", exact=True
        )

    def deploy_to_prod_button(self):
        return self.page.get_by_role("button", name="Deploy to Prod", exact=True)

    def deploy_to_staging_button(self):
        return self.page.get_by_role("button", name="Deploy to Staging", exact=True)

    def undeploy_button(self, channel: str):
        return self.page.get_by_role(
            "button", name=f"Undeploy {channel}", exact=True
        )

    def set_default_button(self, channel: str):
        return self.page.get_by_role(
            "button", name=f"Set {channel} default", exact=True
        )

    def delete_button(self):
        return self.page.get_by_role("button", name="Delete model", exact=True)

    def open_swagger_button(self):
        return self.page.get_by_role("button", name="Open Swagger", exact=True)

    async def open_deploy_modal(self, channel: str) -> Modal:
        button = (self.deploy_to_prod_button() if channel == "production"
                  else self.deploy_to_staging_button())
        await button.click()
        return Modal(self.page, title=f"Deploy to {channel}")

    async def open_undeploy_modal(self, channel: str) -> Modal:
        await self.undeploy_button(channel).click()
        return Modal(self.page, title=f"Undeploy from {channel}")

    async def open_make_default_modal(self, channel: str) -> Modal:
        await self.set_default_button(channel).click()
        return Modal(self.page, title=f"Set {channel} default")

    async def open_delete_modal(self) -> Modal:
        await self.delete_button().click()
        return Modal(self.page, title="Delete model")
