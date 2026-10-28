# LeoWapi SA

Nightlife discovery for Johannesburg and Pretoria: where to go, what it costs, how to get there, and a way to ask the venue. Built from the LeoWapi Tanzania prototype (see `BASELINE.md`).

**Status:** Phase 3 (core platform). Not deployed anywhere. No real venue data yet.

## Stack

Next.js 16 (App Router, TypeScript), Supabase (PostgreSQL with PostGIS, Auth, Storage) and row-level security for every table.

## Run it

```sh
npm install
cp .env.example .env.local   # add a development Supabase project, see docs/environments.md
npm run dev
```

Without Supabase settings the site still runs, and sign-in says it isn't set up.

## Checks

```sh
npm run lint
npm run typecheck
npm test          # business rules
npm run test:db   # database access rules, needs PostgreSQL 16 + PostGIS (tests/db/README.md)
npm run build
```

CI runs all five on every pull request.

## Where things are

| | |
| --- | --- |
| `src/config/market.ts` | Country settings: currency, time zone, phone format, launch cities, feature switches |
| `src/lib/domain/` | Business rules ported from the prototype, with tests |
| `src/lib/auth.ts`, `src/proxy.ts` | Server-side sign-in and session handling |
| `src/app/` | Pages. Only sign-in, account and admin exist so far; the rest waits for the approved design |
| `supabase/migrations/` | Database schema and access rules |
| `supabase/seed.sql` | Labelled sample data for development and staging only |
| `docs/` | `environments.md`, `data-model.md`, `migration.md` |
| `legacy/tanzania-prototype/` | Frozen copy of the prototype, reference only |

## Rules for this repository

- Never deploy to production, start a paid service or touch the Tanzania repository or site without Getrude's written approval.
- No invented venues, prices, ratings or safety information in production. Sample data is marked `is_sample` and the database refuses it in production.
