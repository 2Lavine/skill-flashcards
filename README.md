# @sourcards/skill-flashcards

SourCards **external import skill** for outer agents (Codex, Claude Code, skills-manager, etc.).

Skill name: **`sourcards-flashcards`**

This repo is the **source of truth** for:

- card formulation rules (`SKILL.md` + `references/`)
- deck/category discipline mapping
- pre-import JSON lint (`sourcards-lint-cards`)
- import / list / rollback API usage

It is **not** the in-app Learning Coach runtime (that lives in the SourCards app monorepo under `packages/agent`).

## Layout

```text
SKILL.md
references/
  format.md
  quality-rules.md
  disciplines.md
  api.md
scripts/
  lint-cards.mjs
  lint-cards.test.mjs
```

## Install

### skills-manager / copy install

Point skills-manager at this GitHub repo (or a release tag). It will **copy** into
`~/.skills-manager/skills/sourcards-flashcards`.

Do **not** symlink that destination back into this repo — copy tools refuse
destination-inside-source recursion.

### Codex / Claude (project-local)

In a consumer repo, symlink:

```bash
ln -sfn /path/to/skill-flashcards .agents/skills/sourcards-flashcards
# optional compat alias
ln -sfn /path/to/skill-flashcards .agents/skills/fsrs-flashcards
```

### npm (optional)

```bash
npm i -g @sourcards/skill-flashcards   # when published
sourcards-lint-cards cards.json
```

## Lint

```bash
node scripts/lint-cards.mjs cards.json
node scripts/lint-cards.mjs cards.json --catalog https://sourcard.sourmonkey.xyz
npm test
```

Requires `FLASHCARD_API_KEY` for catalog cross-check and import API calls.

## Develop with the SourCards monorepo

The app monorepo (`fsrs-flashcards`) consumes this repo as a **sibling checkout**:

```text
div-skill/
  skill-flashcards/     ← this repo (SoT)
  fsrs-flashcards/      ← app monorepo (symlinks / pnpm link)
```

App-side health check: `pnpm skill:check` inside `fsrs-flashcards`.

## Versioning

Independent of the app monorepo. Bump this package when skill rules or lint change.
