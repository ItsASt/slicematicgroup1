# SliceMatic — Team Integration Guide

How to get the project running, add your own tables/features, and ship them to the live site without breaking anything.

## 1. One-time setup

```bash
git clone https://github.com/ItsASt/slicematicgroup1.git
cd slicematicgroup1
npm install
cp .env.local.example .env.local   # then fill in the values below
npm run dev                        # http://localhost:3000
```

`.env.local` needs three values (ask the repo owner, or use your local Supabase stack):

| Variable | What it is | Exposed to browser? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key (safe, guarded by RLS) | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin key — **server only, never commit, never `NEXT_PUBLIC_`** | No |

Optional fully-local DB (no cloud needed): install the Supabase CLI and run `supabase start` — it applies every migration in `supabase/migrations/` to a local Docker stack and prints local keys for `.env.local`.

## 2. How the app is wired (read this before adding anything)

```
Browser ──reads menu / subscribes realtime──▶ Supabase (anon key, RLS-guarded)
Browser ──ALL writes──▶ Next.js API routes ──▶ Supabase (service role key)
```

Golden rules:

1. **The browser never writes to the DB directly.** Every insert/update from customers goes through an API route in `app/api/*` that re-validates input and recomputes money server-side. Client-sent prices are never trusted.
2. **Shared logic lives in `lib/`** (`validation.ts`, `pricing.ts`, `orders.ts`) — pure functions, imported by both client (instant UX feedback) and server (enforcement), covered by Vitest.
3. **Schema changes only via migration files.** Never click-create tables in the Supabase dashboard — the GitHub integration applies `supabase/migrations/*.sql` automatically on push to `main`, so the repo must stay the source of truth.

Key directories:

| Path | What lives there |
|---|---|
| `app/order/`, `components/order/` | Customer flow (login → forge → payment → confirmation) |
| `app/kitchen/`, `app/admin/`, `components/staff/` | Staff views (Supabase Auth protected) |
| `app/api/` | Server routes — orders, waiter-call, AI stubs |
| `lib/` | Validation, pricing, order building, Supabase clients, types |
| `supabase/migrations/` | Schema + seed SQL, auto-applied on push |
| `data/*.txt` | Menu source files (`ID ; Name ; Price`) |
| `tests/` | Vitest unit tests |

## 3. Adding a new table

Step 1 — create a migration file. Name format is `YYYYMMDDHHMMSS_description.sql` (timestamp must be later than existing files):

```sql
-- supabase/migrations/20260706120000_add_feedback.sql
create table feedback (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

-- 1. RLS is mandatory — tables are locked down by default in this project.
alter table feedback enable row level security;

-- 2. Policies: who can read/write via the API keys.
--    (No insert policy = browser can't insert; our API route uses the
--    service role key, which bypasses RLS.)
create policy "staff read feedback" on feedback for select to authenticated using (true);

-- 3. Grants: Supabase does NOT auto-expose new tables to API roles.
--    Without these, even the service role gets "permission denied".
grant select on feedback to authenticated;
grant all on feedback to service_role;

-- 4. Only if kitchen/admin need live updates for this table:
alter publication supabase_realtime add table feedback;
```

Step 2 — apply it:

- **Locally:** `supabase migration up` (or `supabase db reset` for a clean rebuild + reseed).
- **Production:** just push to `main` — the Supabase GitHub integration applies it. Check the run under Supabase dashboard → Integrations if it doesn't appear.

Step 3 — add the row type to `lib/types.ts` so the whole codebase agrees on the shape.

## 4. Integrating with the website

**Reading data in a page/component** (menu-style public data or staff views):

```ts
import { supabase } from "@/lib/supabase/client";
const { data, error } = await supabase.from("feedback").select("*");
```

Always handle `error` — every existing page shows a retry UI instead of crashing. Follow that pattern.

**Writing data — make an API route**, never write from the browser:

```ts
// app/api/feedback/route.ts
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    let payload;
    try { payload = await request.json(); }
    catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }

    // validate EVERY field here (see lib/validation.ts for helpers/patterns)

    const db = createAdminClient();
    const { error } = await db.from("feedback").insert({ /* validated fields only */ });
    if (error) return NextResponse.json({ error: "Could not save." }, { status: 503 });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
```

Copy the shape of `app/api/orders/route.ts` — it shows JSON-parse guarding, validation, friendly error messages (no stack traces), and rollback on partial failure.

**Realtime updates** (kitchen-style live feed): see the channel subscription in `app/kitchen/page.tsx` — subscribe in `useEffect`, refresh on event, remove channel on cleanup.

**Menu items:** for quick tweaks (demo day), edit the row directly in Supabase Studio's table editor — the site reflects it on next load. For permanent changes, edit the `data/*.txt` file, run `npx tsx scripts/gen-seed-migration.ts` to regenerate the seed SQL, rename the generated file to a fresh timestamp (so it's newer than already-applied migrations), and push.

## 5. Before you push — the checklist

```bash
npx vitest run    # all tests must pass (add tests for new lib/ logic)
npx eslint .      # zero errors
npx next build    # must compile — Vercel runs exactly this
```

Workflow: branch off `main` (`git checkout -b feat/your-feature`), push, open a PR into `main`. Merging to `main` = **live deploy** (Vercel rebuilds the site, Supabase applies new migrations). Don't push broken code to `main`.

## 6. Gotchas that already bit us (learn from our pain)

- **New tables need explicit `grant` statements** — RLS policies alone aren't enough; you'll get `permission denied` even with the service role.
- **`supabase/config.toml` must keep the `[inbucket]` section name** — the cloud workflow parser rejects the newer `[local_smtp]` name.
- **`NEXT_PUBLIC_*` env vars bake in at build time** — changing them in Vercel requires a redeploy.
- **Never put `SUPABASE_SERVICE_ROLE_KEY` in client code or with a `NEXT_PUBLIC_` prefix** — it bypasses all row security.
- **eslint blocks `setState` directly inside `useEffect`** — load data with `.then()` callbacks (see `MenuBuilder.tsx`).
