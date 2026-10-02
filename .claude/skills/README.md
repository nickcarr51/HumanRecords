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

Foundational (no dependencies):

- **component-library** — theme tokens, styled-components SSR registry, the `src/components`
  primitives, `*.styles.ts` conventions, `/style-guide`.
- **catalog-schema** — Supabase migrations, tables + RLS, SQL functions, seed, the three
  client factories, generated types, local workflow + data tests.

Platform:

- **auth** — invite-only OTP/magic-link sign-in, middleware + route guard, `/feed` redirect
  model, session/role helpers, email templates, inviting users.
- **media-storage** — private R2 bucket, presigned stream/download/image/upload URLs,
  session-gated storage actions, object keys, download recording.

Features:

- **timeline-player** — the `/feed` listener timeline, the persistent music player, the
  album page, and the feed/album data. (First skill; template for the rest.)
- **admin-upload** — releases model, label-member admin portal, and the single/album upload flow.
- **artists-read** — `/artists` browse/search/detail; present but retired (redirected to `/feed`).
