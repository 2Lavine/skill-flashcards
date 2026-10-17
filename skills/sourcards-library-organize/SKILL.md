---
name: sourcards-library-organize
description: Apply a user-confirmed category rename or merge to an existing SourCards library. Use when the user wants to 整理分类, rename categories, merge categories, or apply a library organization plan with their token. Not for a read-only audit (sourcards-library-lint) and not for pre-import cards.json (sourcards-import).
---

# SourCards Library Organize

Change category names on cards that are already in the library.

Issue types, severity, and naming judgment stay in **`sourcards-library-lint`**
(`references/org-rules.md`). This skill only turns a confirmed plan into API calls.

## Hard constraints

1. **Dry-run until the user confirms the exact plan** in this conversation. `--apply` is the only write.
2. **Two operations only:** `rename_category`, `merge_category`. Both stay inside one deck.
3. **No new taxonomy.** `newName` is an existing category name, or a typo fix the user accepted. No `/`.
4. **Do not file uncategorized cards, edit card text, delete decks, or merge decks.** The token cannot read card bodies, so it cannot decide a category from the question.
5. **Stop on the first failed operation.** Say which earlier operations already landed.

## Read on demand

| File | Read when |
|------|-----------|
| `sourcards-library-lint` `references/org-rules.md` | Deciding which categories to rename or merge |
| [references/api.md](references/api.md) | Token permission, request body, or a 401 on write |

## Workflow

`SKILL_ROOT` is the directory of this SKILL.md. If you were not given that path:

```bash
SKILL_ROOT=$(node --input-type=module <<'EOF'
import { existsSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
const name = "sourcards-library-organize";
const marker = "scripts/apply-library-plan.mjs";
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
if (!hits.length) { process.stderr.write("sourcards-library-organize not found\n"); process.exit(1); }
if (hits.length > 1) process.stderr.write("using nearest skill copy; ignored: " + hits.slice(1).join(", ") + "\n");
process.stdout.write(hits[0] + "\n");
EOF
)
```

1. Fetch the live lint (no card bodies):

```bash
node "$SKILL_ROOT/scripts/fetch-library-lint.mjs"
```

2. Write `plan.json` with at most the clusters the user asked to clean. Prefer the better-populated existing name.

```json
{
  "operations": [
    { "op": "rename_category", "deckId": "d1", "oldName": "心里学", "newName": "心理学" },
    { "op": "merge_category", "deckId": "d1", "oldName": "认知偏差", "newName": "认知" }
  ]
}
```

3. Show the dry-run and wait:

```bash
node "$SKILL_ROOT/scripts/apply-library-plan.mjs" plan.json
```

4. After an explicit yes, apply, then fetch the lint again:

```bash
node "$SKILL_ROOT/scripts/apply-library-plan.mjs" plan.json --apply
node "$SKILL_ROOT/scripts/fetch-library-lint.mjs"
```

Exit codes: `0` dry-run or full apply, `1` API or IO failure, `2` bad plan (nothing was sent).

A 401 on fetch means there is no usable token. A 401 only on `--apply` means this token was minted without `catalog:write`. Re-run `sourcards-import` `scripts/login.mjs --force` after the server that knows `catalog:write` is deployed. Keys already stored do not gain the permission.
