---
name: advance-seeds-ml-brain-sync
description: Maintain the advance-seeds-field-inspector-ml second brain (the Obsidian vault at brain/). Use when ingesting code changes, syncing the brain after a feature ships, linting it, auditing doc-vs-code drift, or answering questions from it. Records THIS project's paths, canonical homes, and source priority.
---

# advance-seeds-ml brain sync

The project-specific maintainer for the vault at `brain/` in
`advance-seeds-field-inspector-ml`. Use **together with** the generic `second-brain`
skill: that skill knows *how* to build/maintain a brain; this one knows the *rules of
this one*. Follow `second-brain`'s mode routing (init / ingest / update / lint / query
/ index); apply the project facts below.

## Where things live
- **Vault:** `brain/` (this folder).
- **Sources it documents:** the ml repo — `src/advance_seeds_ml/`, `scripts/`,
  `tests/`, `configs/`, `supabase/`, `apps/web/`, `openspec/`, `notebooks/`.
- **Sibling repo (cross-repo, not yet ingested):** `../advance-seeds-field-inspector-demo`
  (the mobile app + its own brain reference `advance-seeds-brain`).

## Canonical homes (update these first; never restate them elsewhere)
| Topic | Canonical page |
| --- | --- |
| App-facing model artifact + metadata contract | `shared/model-export-contract.md` |
| YOLO-seg dataset layout + validation | `ml-repo/document/dataset-pipeline.md` |
| Class flow web→Colab/Modal→registry→app | `ml-repo/document/training-to-registry-flow.md` |
| Tracked divergences | `shared/drift-register.md` |

## Source priority (highest truth first)
1. Active implementation + tests (`src/`, `scripts/`, `tests/`)
2. Migrations + interface defs (`supabase/migrations/`, `src/advance_seeds_ml/contracts.py`)
3. OpenSpec `openspec/specs/`, then `openspec/changes/`
4. Repo docs (`CLAUDE.md`, `README.md`, `docs/`)
5. Archived specs/changes
6. This brain's own notes

Never silently rewrite a code-vs-doc disagreement — record it in `drift-register.md` first.

## Ingest loop (when a feature ships)
1. Read the changed source first (don't trust the prompt).
2. Read `index.md` + the pages it plausibly touches; search before creating pages.
3. If it touches a canonical contract, update that page first, then linkers.
4. Add `[[wikilinks]]`; update `index.md` for durable new pages.
5. Append one `## [YYYY-MM-DD] <mode> | <scope>` entry to `log.md` (append-only).
6. Run the link lint (in `second-brain` SKILL.md); fix real breaks, note dangling links.

## This vault's state
**Seeded**, not fully ingested. Not yet covered: registry (Supabase schema, edge
functions, R2), web dashboard internals, calibration math, training-worker (Modal),
python-registry-sdk. Those are the highest-value next ingests.
