# advance-seeds-model-registry — STORAGE
> GENERATED VIEW — DO NOT EDIT. Source of truth: STORAGE.json. Edit via qa-revise / engine/patcher.py, then regenerate.

## Summary
- **Test cases:** 4 TC / 5 steps
- ✅ `pass` — 4 TC

---

## STORAGE-0001 — The quota banner reflects current R2 usage
> **Status:** ✅ `pass` | **Type:** Positive | **Viewport:** desktop | **Engine:** playwright | **Priority:** medium

**Objective:** Confirm the storage screen's usage banner shows the actual used space and percentage of quota, and flags an over-quota state distinctly.

**Precondition:** User is signed in as admin and is on the Storage screen.

### Step 1 ✅ — Open the Storage screen
- **Action:** navigate
- **Expected:** The banner shows a used-space figure and a percentage of the configured quota.
- **Result:** Pass _(judged by ai)_
- **Actual:** Quota banner shows '179.3 MB used / 35% of 512 MB demo quota' with a progress bar.

---

## STORAGE-0002 — Deleting an artifact that is still active is blocked
> **Status:** ✅ `pass` | **Type:** Negative | **Viewport:** desktop | **Engine:** playwright | **Priority:** high

**Objective:** Confirm an artifact belonging to a version currently deployed to a channel cannot be deleted from Storage, and explains why.

**Precondition:** A listed artifact belongs to a version that is currently deployed to a channel (shown as active).

**Test data:** `r2_key=runs/run-seeds-v2-041/1.0.0-seeds-v2.tflite`

### Step 1 ✅ — Locate the active artifact's row and its delete action
- **Action:** navigate
- **Expected:** The delete action is disabled, with an explanation that the model must be undeployed first.
- **Result:** Pass _(judged by ai)_
- **Actual:** Active artifact's row located; Delete model button present but disabled (verified disabled=true, title='Undeploy this model before deleting it').

---

## STORAGE-0003 — Deleting an inactive artifact succeeds
> **Status:** ✅ `pass` | **Type:** Positive | **Viewport:** desktop | **Engine:** playwright | **Priority:** medium

**Objective:** Confirm an artifact belonging to a version with no active deployment can be permanently deleted after confirmation.

**Precondition:** A listed artifact belongs to a version that is not deployed to any channel (shown as inactive).

**Test data:** `r2_key=runs/run-old-070/0.7.0-archive.tflite`

### Step 1 ✅ — Locate the inactive artifact's row and choose to delete it
- **Action:** click
- **Expected:** A confirmation dialog warns the deletion is permanent.
- **Result:** Pass _(judged by ai)_
- **Actual:** Screenshot missed the transient modal (evidence-timing gap, verified live: dialog 'Delete model storage' reads 'permanently removes the model version and cannot be undone'); underlying action worked correctly per step 2.

### Step 2 ✅ — Confirm the deletion
- **Action:** click
- **Expected:** The artifact's row no longer appears in the storage list and the used-space figure decreases.
- **Result:** Pass _(judged by ai)_
- **Actual:** Confirmed: both 0.7.0-archive rows gone from the list, used-space dropped 179.3 MB -> 127.7 MB.

---

## STORAGE-0004 — Opening a model from Storage navigates to its Models detail
> **Status:** ✅ `pass` | **Type:** Positive | **Viewport:** desktop | **Engine:** playwright | **Priority:** low

**Objective:** Confirm the storage row's shortcut opens the corresponding version in the Models screen, saving the user from re-finding it manually.

**Precondition:** User is signed in as admin and is on the Storage screen.

**Test data:** `r2_key=runs/run-old-070/0.7.0-archive.tflite`

### Step 1 ✅ — Choose the open-model shortcut on any artifact row
- **Action:** click
- **Expected:** The Models screen is shown with that artifact's version already selected and its detail visible.
- **Result:** Pass _(judged by ai)_
- **Actual:** Open-model shortcut navigated to Models screen with 0.7.0-archive already selected and its detail panel visible.

---

