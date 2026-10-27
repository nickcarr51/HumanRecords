# Human Services

Invite-only web repository for Human Records' music.

## Stack

Next.js 15 (App Router) · TypeScript · Supabase (supabase-js) · Drizzle ORM · styled-components ·
Vitest · yarn

## Getting started

```bash
yarn install
yarn dev
```

Open http://localhost:3000.

## Testing

The data tests run against the local Supabase stack (Docker). Before `yarn test`, start it and
copy `.env.example` to `.env.local` with the local values, including
`DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres`:

```bash
yarn supabase start
yarn supabase migration up
yarn test
```

See `CLAUDE.md` for project conventions and workflow.
