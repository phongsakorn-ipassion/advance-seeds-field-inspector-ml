# advance-seeds-ml brain — conventions

A Second Brain ([[CLAUDE]]) for the **advance-seeds-field-inspector-ml** repo
(training, mobile export, model registry). Open this folder as an Obsidian vault.

## Layout

```
brain/
  CLAUDE.md  README.md  index.md  log.md
  _templates/{entity,contract,decision}-note.md
  ml-repo/      overview · architecture · document/<deep-dives>
  shared/       canonical contract pages · drift-register · glossary
  decisions/    ADR-style decision records
  .claude/skills/advance-seeds-ml-brain-sync/   bundled maintainer skill
```

Start at [[index]] (Map of Content). [[log]] is the append-only timeline.

## Canonical homes (the anti-drift rule)

Exactly one page is the source of truth for each cross-cutting contract. Everything
else links to it.

| Contract / topic | Canonical home |
| --- | --- |
| App-facing model artifact + metadata contract | [[model-export-contract]] |
| YOLO-seg dataset layout the validator expects | [[dataset-pipeline]] |
| Classes flow web→Colab→registry→app | [[training-to-registry-flow]] |
| Known code-vs-doc / contract divergences | [[drift-register]] |

## Source priority (when sources conflict)

1. Active implementation + tests (`src/advance_seeds_ml/`, `scripts/`, `tests/`)
2. Migrations + canonical interface defs (`supabase/migrations/`, `contracts.py`)
3. OpenSpec canonical specs (`openspec/specs/`), then in-flight `openspec/changes/`
4. Repo docs (`CLAUDE.md`, `README.md`, `docs/`)
5. Archived specs/changes
6. This brain's own notes

Never silently rewrite a code-vs-doc disagreement — record it in [[drift-register]] first.

## Scope note

This vault was **seeded** (not a full ingest): it covers the model-export contract,
the dataset pipeline, the class flow, and the decisions from the bootstrap session.
Many pages intentionally link to not-yet-written pages — those dangling links mark
future ingest work. Grow it with the `second-brain` skill as features ship.
