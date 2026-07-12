# skill-flashcards (SourCards Skills plugin)

Codex **plugin** / multi-skill pack for SourCards.

- Plugin name: **`skill-flashcards`**
- Primary skill: **`sourcards-import`** (formerly `sourcards-flashcards`)
- npm package (optional): **`@sourcards/skill-flashcards`**

This repo is the **source of truth** for external agent skills that:

- formulate atomic FSRS-ready flashcards
- lint card JSON before import
- import / list / roll back via the SourCards API

It is **not** the in-app Learning Coach runtime (that lives in the SourCards app monorepo under `packages/agent`).

## Layout (plugin)

```text
.codex-plugin/plugin.json      # Codex plugin manifest
lib/
  org-lint.mjs                 # shared library-organization core (app + CLI)
skills/
  sourcards-import/        # pre-import formulate + JSON lint
  sourcards-library-lint/      # post-import library drift lint (SoT)
package.json                   # optional npm package + bins
README.md
LICENSE
```

Skills:

| Skill | Purpose |
|-------|---------|
| `sourcards-import` | Formulate cards, lint `cards.json`, import |
| `sourcards-library-lint` | Lint existing decks/categories (shared core) |

Shared code:

```js
import { lintLibraryOrganization } from '@sourcards/skill-flashcards/org-lint';
```

## Install

### Codex plugin (preferred for multi-skill)

Install from this repo as a local/personal plugin, or add it to a marketplace that points at the repo root (the directory that contains `.codex-plugin/plugin.json`).

Validate locally:

```bash
python3 ~/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py .
```

### skills-manager / single-skill copy install

Point skills-manager at the **skill directory** (or a release that exposes it):

```text
skills/sourcards-import
```

It will **copy** into `~/.skills-manager/skills/sourcards-import`.

Do **not** symlink that destination back into this repo — copy tools refuse destination-inside-source recursion.

### Project-local symlink (Codex / Claude)

Symlink each **skill folder** (must contain `SKILL.md` at its root):

```bash
ln -sfn /path/to/skill-flashcards/skills/sourcards-import \
  .agents/skills/sourcards-import
ln -sfn /path/to/skill-flashcards/skills/sourcards-library-lint \
  .agents/skills/sourcards-library-lint
# optional compat aliases for the import skill
ln -sfn /path/to/skill-flashcards/skills/sourcards-import \
  .agents/skills/sourcards-import
ln -sfn /path/to/skill-flashcards/skills/sourcards-import \
  .agents/skills/fsrs-flashcards
```

### npm (optional)

```bash
npm i -g @sourcards/skill-flashcards   # when published
sourcards-lint-cards cards.json
```

## Lint

```bash
# pre-import JSON
node skills/sourcards-import/scripts/lint-cards.mjs cards.json
node skills/sourcards-import/scripts/lint-cards.mjs cards.json --catalog https://sourcard.sourmonkey.xyz

# library organization (snapshot or live API)
node skills/sourcards-library-lint/scripts/lint-library.mjs snapshot.json
node skills/sourcards-library-lint/scripts/lint-library.mjs --base https://sourcard.sourmonkey.xyz

npm test
```

Requires `FLASHCARD_API_KEY` for catalog cross-check and import API calls.

## Develop with the SourCards monorepo

The app monorepo (`fsrs-flashcards`) vendors this repo as a **git submodule**:

```text
fsrs-flashcards/
  packages/skill-flashcards/   ← this plugin repo (submodule SoT)
  .agents/skills/sourcards-import → packages/skill-flashcards/skills/sourcards-import
  .agents/skills/sourcards-import → packages/skill-flashcards/skills/sourcards-import  # compat
  .agents/skills/sourcards-library-lint → packages/skill-flashcards/skills/sourcards-library-lint
```

After cloning the monorepo:

```bash
git submodule update --init packages/skill-flashcards
pnpm install
pnpm skill:check
```

## Versioning

Independent of the app monorepo. Bump `package.json` and `.codex-plugin/plugin.json` together when skill rules or lint change.
