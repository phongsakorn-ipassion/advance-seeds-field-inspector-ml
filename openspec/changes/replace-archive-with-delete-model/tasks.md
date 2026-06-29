# Tasks

## 1. Backend
- [x] Add `run_id` to the `handleDelete` version select.
- [x] After deleting the version, delete the parent run iff no sibling version
      references it; return `deleted_run` in the response.

## 2. Web store API
- [x] Rename `archiveVersion` → `deleteVersion` in `api.ts`.
- [x] `supabaseStore.deleteVersion` calls `archiveVersionById(id, "delete")`.
- [x] `demoStore.deleteVersion` hard-deletes the snapshot row (+ run if last),
      keeping the channel/deployment guard.

## 3. UI
- [x] Rename the action to **Delete model** (label, `Trash2` icon, title).
- [x] Update the confirmation modal copy and wire it to `store.deleteVersion`.

## 4. Tests
- [x] Vitest: `demoStore.deleteVersion` removes a version; refuses a deployed one.
- [x] Deno: `storage-usage` delete path (guarded integration test for run cleanup).
- [x] `tsc -b` + full Vitest suite green.

## 5. Validation
- [ ] `openspec validate --all --strict`
- [ ] `python3 -m unittest discover -s tests`
