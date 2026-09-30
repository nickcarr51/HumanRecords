# Project Skills

Claude Code skills specific to Human Services, one directory per major feature.

## Convention

```
<feature-name>/
    SKILL.md          # main skill file (frontmatter name + description); summary + links
    References/        # drill-down .md files, one per aspect of the feature
    Walkthrough/       # code guide: how the feature's CODE works, for a human reading the source (gitignored)
```

- `SKILL.md` must be uppercase with `name:`/`description:` frontmatter so Claude Code
  discovers it; its `description` is the trigger text.
- `SKILL.md` links to each `References/*.md` and cross-links sibling skills under
  "Depends on" (skills build on each other).
- `Walkthrough/` is gitignored (`.claude/skills/**/Walkthrough/`).

## Skills

- **timeline-player** — the `/feed` listener timeline, the persistent music player, the
  album page, and the feed/album data + auth redirects. (First skill; template for the rest.)
- **admin-upload** — releases model, label-member admin portal, and the single/album upload flow.

Planned (one per thread): component-library, catalog-schema, auth, media-storage,
artists-read. See `docs/handoffs/2026-09-29-skill-directories-divvy.md`.
