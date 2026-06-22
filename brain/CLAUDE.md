# This vault is a Second Brain (LLM Wiki)

This folder is a **persistent, compounding Markdown wiki** about the Advance Seeds
Field Inspector **ML / training / model-registry** repo. It sits between a human
and the raw source code. Unlike a fresh code search every time, this wiki is
compiled once and *kept current*: cross-references already exist, contradictions
are flagged in a drift register, and synthesis already reflects what was ingested.

## The three layers
1. **Raw sources** — the code in this repo (`src/`, `scripts/`, `supabase/`,
   `apps/web/`, `openspec/`). Immutable from the wiki's point of view: read, never edit.
2. **The wiki** — the Markdown pages here. LLM-owned.
3. **The schema** — this file (the idea) + `README.md` (this vault's rules) +
   `.claude/skills/advance-seeds-ml-brain-sync/` (the project-specific maintainer).

## The discipline that makes it work
- **Reflect reality, cite it.** Every non-obvious claim carries a `path:line` citation.
  Verify against source before asserting.
- **One canonical home per contract.** See `[[model-export-contract]]`. Other pages
  link to it; they never restate it.
- **Logs are append-only.** `[[log]]` is the timeline; never rewrite it.
- **Report drift, don't silently fix it.** When code and a doc disagree, record it in
  `[[drift-register]]` with which side is stale.

To maintain this vault, invoke the `second-brain` skill (modes: ingest / update /
lint / query / index) together with the bundled `advance-seeds-ml-brain-sync` skill,
which records *this* project's paths, canonical homes, and source priority.
