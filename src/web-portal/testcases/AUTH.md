# advance-seeds-model-registry — AUTH
> GENERATED VIEW — DO NOT EDIT. Source of truth: AUTH.json. Edit via qa-revise / engine/patcher.py, then regenerate.

## Summary
- **Test cases:** 4 TC / 10 steps
- ✅ `pass` — 4 TC

---

## AUTH-0001 — One-click admin sign-in reaches the operator console
> **Status:** ✅ `pass` | **Type:** Positive | **Viewport:** desktop | **Engine:** playwright | **Priority:** high

**Objective:** Confirm the pre-created admin account can sign in with the one-click card and lands on the Overview screen with admin privileges.

**Precondition:** Dev server reachable; the browser has no existing session (fresh context / signed out).

### Step 1 ✅ — Open the dashboard
- **Action:** navigate
- **Expected:** The login screen is shown with the one-click admin sign-in option.
- **Result:** Pass _(judged by ai)_
- **Actual:** Login screen shown with the one-click admin sign-in card (Sign in as Admin / admin@advance-seeds.demo).

### Step 2 ✅ — Sign in as admin
- **Action:** click
- **Expected:** The user is signed in and the Overview screen is shown, with the account shown as admin in the top bar.
- **Result:** Pass _(judged by ai)_
- **Actual:** Signed in and landed on Overview; top bar shows admin@advance-seeds.demo / ADMIN role badge.

---

## AUTH-0002 — Manual sign-in with valid admin credentials reaches the operator console
> **Status:** ✅ `pass` | **Type:** Positive | **Viewport:** desktop | **Engine:** playwright | **Priority:** medium

**Objective:** Confirm a user can bypass the one-click shortcut and sign in with the admin's own email and password.

**Precondition:** Dev server reachable; the browser has no existing session (fresh context / signed out).

**Test data:** `email=$QA_ADMIN_EMAIL`, `password=$QA_ADMIN_PASSWORD`

### Step 1 ✅ — Open the dashboard
- **Action:** navigate
- **Expected:** The login screen is shown.
- **Result:** Pass _(judged by ai)_
- **Actual:** Login screen shown.

### Step 2 ✅ — Switch to manual sign-in
- **Action:** click
- **Expected:** An email and password form is shown in place of the one-click card.
- **Result:** Pass _(judged by ai)_
- **Actual:** Use a different account clicked; email/password manual form is shown in place of the one-click card.

### Step 3 ✅ — Enter the admin's email and password and submit
- **Action:** submit
- **Expected:** The user is signed in and the Overview screen is shown.
- **Test data:** valid admin email + password
- **Result:** Pass _(judged by ai)_
- **Actual:** Signed in with QA_ADMIN_EMAIL/PASSWORD (demo mode); landed on Overview screen.

---

## AUTH-0003 — Manual sign-in with an incorrect password is rejected
> **Status:** ✅ `pass` | **Type:** Negative | **Viewport:** desktop | **Engine:** playwright | **Priority:** high

**Objective:** Confirm an incorrect password is rejected with a visible error and the user stays on the login screen.

**Precondition:** Dev server reachable; the browser has no existing session (fresh context / signed out).

**Test data:** `email=$QA_ADMIN_EMAIL`, `password=WrongPassword123!`

### Step 1 ✅ — Open the dashboard
- **Action:** navigate
- **Expected:** The login screen is shown.
- **Result:** Pass _(judged by ai)_
- **Actual:** Login screen shown.

### Step 2 ✅ — Switch to manual sign-in
- **Action:** click
- **Expected:** The email and password form is shown.
- **Result:** Pass _(judged by ai)_
- **Actual:** Manual sign-in form shown.

### Step 3 ✅ — Enter a valid email with an incorrect password and submit
- **Action:** submit
- **Expected:** An error message is shown, the login screen remains, and no session is created.
- **Test data:** valid email + wrong password
- **Result:** Pass _(judged by ai)_
- **Actual:** Wrong password submitted: red 'Invalid demo admin credentials.' error shown, login screen remains, no session created.

---

## AUTH-0004 — Sign out returns to the login screen
> **Status:** ✅ `pass` | **Type:** Positive | **Viewport:** desktop | **Engine:** playwright | **Priority:** medium

**Objective:** Confirm signing out ends the session and returns the user to the unauthenticated login screen.

**Precondition:** User is already signed in as admin.

### Step 1 ✅ — Sign in as admin
- **Action:** click
- **Expected:** The Overview screen is shown.
- **Result:** Pass _(judged by ai)_
- **Actual:** Signed in as admin; Overview screen shown.

### Step 2 ✅ — Sign out
- **Action:** click
- **Expected:** The login screen is shown again and the previously visible account/session details are gone.
- **Result:** Pass _(judged by ai)_
- **Actual:** Signed out; back on the unauthenticated login screen, no account/session details visible.

---

