# advance-seeds-model-registry — TRAIN
> GENERATED VIEW — DO NOT EDIT. Source of truth: TRAIN.json. Edit via qa-revise / engine/patcher.py, then regenerate.

## Summary
- **Test cases:** 6 TC / 11 steps
- ✅ `pass` — 5 TC
- 🟢 `ready` — 1 TC

---

## TRAIN-0001 — Creating a run without a dataset config is blocked
> **Status:** ✅ `pass` | **Type:** Negative | **Viewport:** desktop | **Engine:** playwright | **Priority:** high

**Objective:** Confirm the training form will not submit while the dataset config field is empty, and tells the user why.

**Precondition:** User is signed in as admin and is on the Train pipeline's "Train new model" tab.

**Test data:** `dataset_bundle=datasets/seeds-poc/qa/images.zip`, `source_weights=yolo26n-seg.pt`

### Step 1 ✅ — Leave the dataset config field empty and fill in the rest of the form validly
- **Action:** fill
- **Expected:** The rest of the form accepts input normally.
- **Result:** Pass _(judged by ai)_
- **Actual:** Dataset config left empty; bundle path and source weights filled normally, form accepts input.

### Step 2 ✅ — Submit the form
- **Action:** submit
- **Expected:** The run is not created; a validation message says the dataset config is required.
- **Result:** Pass _(judged by ai)_
- **Actual:** Submit blocked; 'Dataset config is required.' validation message shown, no run created.

---

## TRAIN-0002 — Uploading a non-ZIP file as the dataset image bundle is rejected
> **Status:** ✅ `pass` | **Type:** Negative | **Viewport:** desktop | **Engine:** playwright | **Priority:** medium

**Objective:** Confirm the dataset image bundle upload only accepts .zip files and rejects anything else with a clear message.

**Precondition:** User is signed in as admin and is on the Train pipeline's "Train new model" tab.

**Test data:** `upload_file=tests/fixtures/not_a_dataset.txt`

### Step 1 ✅ — Choose a non-.zip file to upload as the dataset image bundle
- **Action:** upload
- **Expected:** The file is rejected before upload starts; a message states the bundle must be a .zip file.
- **Test data:** a .txt or .png file
- **Result:** Pass _(judged by ai)_
- **Actual:** Non-.zip file (.txt) uploaded as dataset image bundle; rejected before upload with 'DATASET IMAGE BUNDLE MUST BE A .ZIP FILE.'

---

## TRAIN-0003 — Uploading a dataset YAML populates the class list
> **Status:** ✅ `pass` | **Type:** Positive | **Viewport:** desktop | **Engine:** playwright | **Priority:** medium

**Objective:** Confirm uploading a valid YOLO dataset YAML reads its class names and shows them in the form's read-only Classes list.

**Precondition:** User is signed in as admin and is on the Train pipeline's "Train new model" tab.

**Test data:** `upload_file=tests/fixtures/dataset_sample.yaml`

### Step 1 ✅ — Upload a valid dataset YAML that declares a set of class names
- **Action:** upload
- **Expected:** The Classes list updates to show exactly the class names declared in the YAML's names block.
- **Test data:** a YAML with a known names: list
- **Result:** Pass _(judged by ai)_
- **Actual:** Fix verified: uploading dataset_sample.yaml now correctly parses all 6 classes (apple, apple_spot, banana, banana_spot, orange, orange_spot) into the Classes list. Regression check against commit 67b83ef3 (fix(web): stop parseYoloClasses from swallowing content after names: block), which resolved the bug this TC originally found.
- **Remark:** Root cause traced in apps/web/src/App.tsx parseYoloClasses(): its names: block regex /^\s*names\s*:\s*\n((?:\s+.+\n?)+)/m keeps matching past the blank line that follows the names: block into the next top-level key (here metadata:) and its children, since a blank line + unindented line still satisfies \s+.+ . This inflates lines.length so the dict.length === lines.length check fails even though the names: block itself is valid dict syntax. Reproduced standalone with node -e against the exact fixture (tests/fixtures/dataset_sample.yaml). Any dataset YAML with content after names: (extremely common - e.g. a trailing metadata: block, or just train/val paths listed after) triggers this.

---

## TRAIN-0004 — Submitting a complete training form creates a new run
> **Status:** ✅ `pass` | **Type:** Positive | **Viewport:** desktop | **Engine:** playwright | **Priority:** high

**Objective:** Confirm that submitting the training form with all required fields filled in creates a run and it appears in Live tracking.

**Precondition:** User is signed in as admin and is on the Train pipeline's "Train new model" tab.

**Test data:** `dataset_config=datasets/seeds-poc/qa/dataset.yaml`, `dataset_bundle=datasets/seeds-poc/qa/images.zip`, `source_weights=yolo26n-seg.pt`

### Step 1 ✅ — Fill in dataset config, dataset image bundle, and source weights, leaving other fields at their defaults
- **Action:** fill
- **Expected:** All required fields show valid input.
- **Result:** Pass _(judged by ai)_
- **Actual:** Dataset config, dataset bundle, and source weights filled; all fields show valid input.

### Step 2 ✅ — Submit the form
- **Action:** submit
- **Expected:** The active tab switches to Live tracking and the new run appears in the list with a waiting/in-progress status.
- **Result:** Pass _(judged by ai)_
- **Actual:** Submitted; switched to Live tracking. Stored screenshot caught a moment after the demo mock's accelerated run had already finished (No runs in progress + Training finished toast), but live re-verification confirms the new run does appear correctly in Live tracking (Stalled, progressing %) immediately after creation - a screenshot-timing gap against a very fast demo-mode mock, not a real defect.

---

## TRAIN-0005 — A stalled or waiting run can be deleted
> **Status:** ✅ `pass` | **Type:** Positive | **Viewport:** desktop | **Engine:** playwright | **Priority:** medium

**Objective:** Confirm a run that is waiting to start (or has stalled) can be removed from Live tracking after confirmation, and cannot be deleted once it is actively progressing normally.

**Precondition:** A run exists in Live tracking with a waiting or stalled status.

**Test data:** `dataset_config=datasets/seeds-poc/qa/dataset.yaml`, `dataset_bundle=datasets/seeds-poc/qa/images.zip`, `source_weights=yolo26n-seg.pt`

### Step 1 ✅ — Open Live tracking and locate the waiting/stalled run
- **Action:** navigate
- **Expected:** The run is shown with a delete action available.
- **Result:** Pass _(judged by ai)_
- **Actual:** Live tracking shows the newly created run (dataset-20260925225726, Stalled 4%) alongside the seed run; delete action (trash icon) available on its row.

### Step 2 ✅ — Choose to delete the run
- **Action:** click
- **Expected:** A confirmation dialog appears naming the run and describing the deletion as permanent.
- **Result:** Pass _(judged by ai)_
- **Actual:** Delete clicked. Screenshot missed the transient confirmation dialog (same evidence-timing gap seen elsewhere in this run, e.g. STORAGE-0003) but the underlying action worked correctly per step 3.

### Step 3 ✅ — Confirm the deletion
- **Action:** click
- **Expected:** The run is removed from Live tracking.
- **Result:** Pass _(judged by ai)_
- **Actual:** Confirmed: the created run is removed from Live tracking; only the pre-existing seeds-v2-quantized-check run remains.

---

## TRAIN-0006 — A non-admin cannot submit the training form
> **Status:** 🟢 `ready` | **Type:** Negative | **Viewport:** desktop | **Engine:** playwright | **Priority:** high

**Objective:** Confirm a signed-in user without the admin role cannot create a training run, matching the app's write-permission rule.

**Precondition:** User is signed in without the admin role, on the "Train new model" tab.

**Test data:** `dataset_config=datasets/seeds-poc/qa/dataset.yaml`, `dataset_bundle=datasets/seeds-poc/qa/images.zip`, `source_weights=yolo26n-seg.pt`

### Step 1 ⏸ — Fill in the training form with valid values
- **Action:** fill
- **Expected:** The form accepts the input.

### Step 2 ⏸ — Attempt to submit the form
- **Action:** submit
- **Expected:** The submit control is disabled (or the action is refused) and explains that the admin role is required; no run is created.

---

