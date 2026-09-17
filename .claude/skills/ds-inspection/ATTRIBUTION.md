# Attribution

The `ds-inspection` skill in this folder is **not ours**. It was created by
**[Brad Frost](https://bradfrost.com)** and is published at
**<https://github.com/bradfrost/skills>**.

It is bundled here, unmodified, so that anyone who opens this repository can run
the health check without installing anything. Claude Code picks up skills in
`.claude/skills/` automatically.

It is redistributed under the MIT licence — see `LICENSE` in this folder.
Copyright (c) 2026 Brad Frost Web LLC.

## If you want the whole set

This is one skill out of several. To install all of Brad's skills for every
project on your machine:

```bash
npx skills add bradfrost/skills -g -a claude-code
```

His skills grew out of his courses, which are worth your time:
[AI & Design Systems](https://aianddesign.systems/) ·
[Subatomic: The Complete Guide To Design Tokens](https://designtokenscourse.com/) ·
[Atomic Design Certification Course](https://atomicdesigncourse.com/)

## What we changed

Nothing inside the skill. Our own material lives outside it, in `ds-inspection/`
at the root of this repo:

- `GARAGE.md` — the running record of this system
- `checks/contrast-pairs.mjs` — an extra colour-contrast check of our own
- `reports/` and `work-orders/` — the output of past inspections
