# advance-seeds-model-registry — MODELS
> GENERATED VIEW — DO NOT EDIT. Source of truth: MODELS.json. Edit via qa-revise / engine/patcher.py, then regenerate.

## Summary
- **Test cases:** 7 TC / 15 steps
- ✅ `pass` — 7 TC

---

## MODELS-0001 — Filtering by channel narrows the version list
> **Status:** ✅ `pass` | **Type:** Positive | **Viewport:** desktop | **Engine:** playwright | **Priority:** medium

**Objective:** Confirm choosing a channel filter shows only versions currently in that state.

**Precondition:** User is signed in as admin and is on the Models screen.

**Test data:** `channels=['staging', 'archived']`

### Step 1 ✅ — Choose the Staging filter
- **Action:** select
- **Expected:** Only versions currently deployed to staging are listed.
- **Test data:** channel = staging
- **Result:** Pass _(judged by ai)_
- **Actual:** Staging filter selected; only 1.0.0-seeds-v2 (deployed to staging) is listed.

### Step 2 ✅ — Choose the Archived filter
- **Action:** select
- **Expected:** Only archived versions are listed (or an empty-state message if none exist).
- **Test data:** channel = archived
- **Result:** Pass _(judged by ai)_
- **Actual:** Archived filter selected; empty state 'No matching versions' shown (no archived versions exist).

---

## MODELS-0002 — Deploying a candidate version to a channel succeeds
> **Status:** ✅ `pass` | **Type:** Positive | **Viewport:** desktop | **Engine:** playwright | **Priority:** high

**Objective:** Confirm a version not yet deployed anywhere can be deployed to staging or production as a selectable (non-default) version, after confirmation.

**Precondition:** A version exists that is not currently deployed to any channel.

**Test data:** `version=0.7.0-archive`, `channel=staging`

### Step 1 ✅ — Select the undeployed version
- **Action:** click
- **Expected:** Its detail panel shows deploy actions for both staging and production.
- **Result:** Pass _(judged by ai)_
- **Actual:** 0.7.0-archive selected (Inactive); detail panel confirms both Deploy to Prod / Deploy to Staging actions exist (visible in next step's pre-shot).

### Step 2 ✅ — Choose to deploy it to a channel
- **Action:** click
- **Expected:** A confirmation dialog explains the version will become a selectable deployment on that channel without replacing the current default.
- **Test data:** target channel
- **Result:** Pass _(judged by ai)_
- **Actual:** Deploy-to-staging modal explains the version becomes a selectable model without changing the current default.

### Step 3 ✅ — Confirm the deployment
- **Action:** click
- **Expected:** The version's lifecycle status shows it is now deployed to that channel (not yet default).
- **Result:** Pass _(judged by ai)_
- **Actual:** Deployed: Staging deployment banner now shows for 0.7.0-archive with no Default badge; toast confirms 'Model version ready 0.7.0-archive'.

---

## MODELS-0003 — Making a deployed version the channel default succeeds
> **Status:** ✅ `pass` | **Type:** Positive | **Viewport:** desktop | **Engine:** playwright | **Priority:** high

**Objective:** Confirm a version already deployed to a channel, but not yet its default, can be promoted to the default that mobile clients resolve.

**Precondition:** A version is deployed to a channel but is not that channel's current default.

**Test data:** `version=0.7.0-archive`, `channel=staging`

### Step 1 ✅ — Select the non-default deployed version
- **Action:** click
- **Expected:** A "make default" action is available for that channel.
- **Result:** Pass _(judged by ai)_
- **Actual:** 0.7.0-archive selected; shown deployed to Staging (not yet default).

### Step 2 ✅ — Choose to make it the channel default
- **Action:** click
- **Expected:** The version's lifecycle status now shows it as the default for that channel, and the previous default no longer shows as default.
- **Result:** Pass _(judged by ai)_
- **Actual:** Made default: toast 'Default staging model changed - 0.7.0-archive is default'; Deploy to Prod / Undeploy actions now shown for it.

---

## MODELS-0004 — Undeploying a version from a channel succeeds
> **Status:** ✅ `pass` | **Type:** Positive | **Viewport:** desktop | **Engine:** playwright | **Priority:** medium

**Objective:** Confirm a deployed version can be removed from a channel after confirmation.

**Precondition:** A version is currently deployed to a channel.

**Test data:** `version=1.0.0-seeds-v2`, `channel=staging`

### Step 1 ✅ — Select the deployed version
- **Action:** click
- **Expected:** An undeploy action is available for that channel.
- **Result:** Pass _(judged by ai)_
- **Actual:** 1.0.0-seeds-v2 selected; shown deployed+default on Staging.

### Step 2 ✅ — Choose to undeploy from the channel
- **Action:** click
- **Expected:** A confirmation dialog appears naming the channel.
- **Result:** Pass _(judged by ai)_
- **Actual:** Undeploy-from-staging modal confirms removal, naming the channel and noting other deployed models remain.

### Step 3 ✅ — Confirm the undeploy
- **Action:** click
- **Expected:** The version's lifecycle status no longer shows it deployed to that channel.
- **Result:** Pass _(judged by ai)_
- **Actual:** Undeployed: detail now shows 'Not deployed to staging or production'; toast 'staging undeployed - No default model is assigned to staging'.

---

## MODELS-0005 — Deleting a version that is still deployed is blocked
> **Status:** ✅ `pass` | **Type:** Negative | **Viewport:** desktop | **Engine:** playwright | **Priority:** high

**Objective:** Confirm the app refuses to delete a model version while it remains deployed to any channel, and explains why.

**Precondition:** A version is currently deployed to at least one channel.

**Test data:** `version=1.0.0-seeds-v2`

### Step 1 ✅ — Select the deployed version and locate the delete action
- **Action:** click
- **Expected:** The delete action is disabled, with an explanation that the version must be undeployed first.
- **Result:** Pass _(judged by ai)_
- **Actual:** 1.0.0-seeds-v2 selected; Delete model button present but disabled (verified disabled=true, title='Undeploy this model before deleting it').

---

## MODELS-0006 — Deleting a version that is not deployed anywhere succeeds
> **Status:** ✅ `pass` | **Type:** Positive | **Viewport:** desktop | **Engine:** playwright | **Priority:** medium

**Objective:** Confirm a version with no active deployments can be permanently deleted after confirmation.

**Precondition:** A version exists that is not deployed to any channel.

**Test data:** `version=0.7.0-archive`

### Step 1 ✅ — Select the undeployed version and choose to delete it
- **Action:** click
- **Expected:** A confirmation dialog warns the deletion is permanent, covering the version, its artifacts, and its training run.
- **Result:** Pass _(judged by ai)_
- **Actual:** 0.7.0-archive selected (undeployed); delete confirmation dialog warns deletion is permanent, covering the version, its artifacts, and its training run.

### Step 2 ✅ — Confirm the deletion
- **Action:** click
- **Expected:** The version no longer appears in the version list.
- **Result:** Pass _(judged by ai)_
- **Actual:** Confirmed deletion: 0.7.0-archive no longer appears anywhere in the version list (verified live).

---

## MODELS-0007 — Renaming a version to one that already exists is rejected
> **Status:** ✅ `pass` | **Type:** Negative | **Viewport:** desktop | **Engine:** playwright | **Priority:** medium

**Objective:** Confirm the app enforces unique version names and shows an error rather than silently overwriting or duplicating.

**Precondition:** At least two model versions exist.

**Test data:** `version=0.7.0-archive`, `duplicate_name=1.0.0-seeds-v2`

### Step 1 ✅ — Select a version and start renaming it
- **Action:** click
- **Expected:** An inline rename field is shown, pre-filled with the current name.
- **Result:** Pass _(judged by ai)_
- **Actual:** Rename field shown, pre-filled with '0.7.0-archive'.

### Step 2 ✅ — Enter the exact name of a different, existing version and save
- **Action:** submit
- **Expected:** The rename is rejected with an error stating that name already exists; the version keeps its original name.
- **Test data:** name of another existing version
- **Result:** Pass _(judged by ai)_
- **Actual:** Renaming to '1.0.0-seeds-v2' rejected with error 'Version "1.0.0-seeds-v2" already exists.'

---

