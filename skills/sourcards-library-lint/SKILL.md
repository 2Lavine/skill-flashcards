---
name: sourcards-library-lint
description: Audit an existing SourCards library for deck/category drift, near-duplicates, empty/tiny groups, and uncategorized backlog. Use when the user asks to lint their library, 整理牌组, clean messy decks/categories, find naming drift, or review organization after many imports. Not for pre-import cards.json lint (use sourcards-import).
---

# SourCards Library Lint

Keep an **already-imported** library healthy as decks and categories accumulate.

This skill is the **source of truth** for library organization lint:

- issue taxonomy + severity
- pure algorithm (`lib/org-lint.mjs`)
- outer-agent / CLI workflow

Pre-import JSON lint is a different skill: **`sourcards-import`**.

## Read on demand

| File | Read when |
|------|-----------|
| [references/org-rules.md](references/org-rules.md) | Interpreting issues, naming discipline, response shape |
| [references/api.md](references/api.md) | Preparing and validating the complete exported snapshot used by the CLI |

## Hard constraints

1. **Read-only by default.** Lint reports; it does not merge/rename/delete for the user.
2. **Prefer canonical existing names** over inventing a second taxonomy.
3. **Cluster before listing.** Group related issues; do not dump every row as a paragraph.
4. **Do not confuse with import lint.** `cards.json` formulation errors belong to `sourcards-import`.

## Workflow

### A. Complete exported snapshot

Ask the user for a complete library organization snapshot, then lint it locally.
Personal Integration Tokens do **not** authorize `GET /api/library-lint`, and the
owner-scoped `catalog:read` deck/category endpoints do not include enough card
counts or uncategorized data to reconstruct this snapshot.

`SKILL_ROOT` is the directory of this SKILL.md. Do not pick among install layouts. If you were not given that path:

```bash
SKILL_ROOT=$(node --input-type=module <<'EOF'
import { existsSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
const name = "sourcards-library-lint";
const marker = "scripts/lint-library.mjs";
const hits = [];
const add = (p) => {
  if (!existsSync(join(p, "SKILL.md")) || !existsSync(join(p, marker))) return;
  let real; try { real = realpathSync(p); } catch { return; }
  if (!hits.includes(real)) hits.push(real);
};
let dir = process.cwd();
for (let i = 0; i < 8; i++) {
  add(dir);
  add(join(dir, "skills", name));
  add(join(dir, ".agents", "skills", name));
  add(join(dir, ".claude", "skills", name));
  const parent = dirname(dir);
  if (parent === dir) break;
  dir = parent;
}
if (!hits.length) {
  const home = homedir();
  for (const p of [join(home, ".agents", "skills", name), join(home, ".claude", "skills", name), join(home, ".skills-manager", "skills", name)]) add(p);
}
if (!hits.length) { process.stderr.write("sourcards-library-lint not found\n"); process.exit(1); }
if (hits.length > 1) process.stderr.write("using nearest skill copy; ignored: " + hits.slice(1).join(", ") + "\n");
process.stdout.write(hits[0] + "\n");
EOF
)
node "$SKILL_ROOT/scripts/lint-library.mjs" snapshot.json
```

The CLI accepts snapshot files only. It does not authenticate to a live account.

### Snapshot shape

```json
{
  "decks": [{ "id": "d1", "name": "心理学", "cardCount": 12 }],
  "categories": [{ "deckId": "d1", "deckName": "心理学", "category": "认知", "cardCount": 4 }],
  "uncategorized": [{ "deckId": "d1", "deckName": "心理学", "cardCount": 2 }]
}
```

### B. In-app Coach

Coach tool `lint_cards` calls the **same** `lintLibraryOrganization` core. SOP for coaching UX lives in the app `card-audit` skill; rules/issue types remain this pack.

## Output

```json
{
  "summary": {
    "total_decks": 0,
    "total_cards": 0,
    "total_categories": 0,
    "total_uncategorized": 0,
    "total_issues": 0
  },
  "issues": [
    {
      "type": "duplicate_deck_name",
      "severity": "warning",
      "detail": "...",
      "suggestion": "..."
    }
  ]
}
```

Exit codes:

- `0` — ran successfully (issues may still exist; they are advisory)
- `1` — failed to load or validate the snapshot

## After the report

1. One-line snapshot from `summary`
2. Priority clusters (`warning` → `suggestion` → `info`)
3. Concrete cleanup actions for Browse / Deck Management
4. Stop after an actionable plan (3–7 steps)
