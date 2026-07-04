# SliceMatic MVP — Design

**Date:** 2026-07-05
**Status:** Approved
**Context:** PizzaFlow Stage 3 build — full-stack pizza ordering system replacing a Google Form process for SliceMatic, a single-outlet pizza shop. Demo day: July 7. AI features are explicitly deferred; this build leaves clean seams for them.

## Goal

A production-grade, mobile-first ordering system with three interfaces:

1. **Customer app** — QR entry per table, no-password login (name + phone), menu browsing, order building, live bill preview, payment mode selection, order confirmation, persistent "Call Waiter" button.
2. **Kitchen view** — staff-authenticated realtime feed of incoming orders and waiter-call alerts, per-order status toggle.
3. **Admin dashboard** — staff-authenticated table of all orders.

Deploy target: Vercel (frontend + API routes) and Supabase (Postgres, Auth, Realtime).

## Decisions (locked with user)

| Decision | Choice |
|---|---|
| Framework | Next.js 15, App Router, TypeScript |
| Supabase | Scaffold with env placeholders; user plugs keys in later. SQL migration file ready to paste into Supabase SQL editor. |
| Menu schema | Three separate tables: `bases`, `pizzas`, `toppings`. Seeded from the three assignment `.txt` files by a defensive seed script. DB is the runtime source of truth (per Stage 3 spec); txt files are the seed input (reconciles Stage 2's file-driven menu story). |
| Staff auth | One Supabase Auth login guards both `/kitchen` and `/admin`. Customers are anonymous. |
| Architecture | **Hybrid (Approach C):** reads + realtime subscriptions direct from browser via Supabase anon client; all writes go through Next.js API routes that re-validate and recompute server-side with the service-role key. |

## Architecture & Routes

**Stack:** Next.js 15 (App Router, TS), Tailwind CSS, Framer Motion, Supabase JS. Vercel deploy.

| Route | Who | What |
|---|---|---|
| `/order?table=12` | Customer | Login → menu → cart → bill → payment → confirm. Missing/invalid `table` param → friendly table-picker screen, no crash. |
| `/kitchen` | Staff (auth) | Realtime order feed (newest first) + waiter-call alerts, status toggles. |
| `/admin` | Staff (auth) | Orders table: customer name, items, total, payment mode, table_id, timestamp. Live-refreshes on insert. |
| `/login` | Staff | Supabase Auth email/password. |
| `POST /api/orders` | Server | Validates all fields, recomputes bill from DB prices, inserts order + line items. |
| `POST /api/waiter-call` | Server | Creates assistance request tied to `table_id`. |
| `/api/ai/upsell`, `/api/ai/mood`, `/api/ai/feedback` | — | Stub handlers returning 501 with a documentation comment describing the intended contract. AI seams only — not built in this phase. |

**Customer session state** (name, phone, table_id, cart): React context, client memory only. No persistence across visits — fresh login every time, per spec.

## Database Schema (Supabase Postgres)

```sql
bases     (id, name, price)   -- seeded from Types_of_Base.txt
pizzas    (id, name, price)   -- seeded from Types_of_Pizza.txt
toppings  (id, name, price)   -- seeded from Types_of_Toppings.txt

orders (
  id uuid pk, customer_name, phone, table_id,
  subtotal, discount, gst, total numeric(10,2),
  payment_mode check in ('cash','card','upi'),
  status check in ('received','preparing','ready') default 'received',
  created_at timestamptz default now()
)

order_items (
  id, order_id fk -> orders (on delete cascade),
  item_type check in ('base','pizza','topping'),
  item_id, item_name, unit_price,   -- name + price snapshotted at order time
  quantity
)

waiter_calls (
  id, table_id,
  status check in ('pending','acknowledged'),
  created_at, resolved_at
)
```

**Snapshot rationale:** `order_items` stores `item_name` and `unit_price` at order time, so a later menu price change never corrupts historical bills.

**RLS:**
- `bases`/`pizzas`/`toppings`: public read; writes blocked for anon.
- `orders`/`order_items`/`waiter_calls`: read + update require authenticated staff; anon inserts blocked (server inserts via service role).
- Realtime enabled on `orders` and `waiter_calls`.

**Seeding:** `scripts/seed.ts` parses the three txt files (`ID ; Name ; Price` per line). Defensive: trims whitespace, skips malformed lines with a console warning, validates price is numeric. Upserts into the three menu tables. Menu update path: edit txt and re-run seed, or edit the row directly in Supabase.

## Validation & Bill Logic

Shared modules imported by both client (inline UX feedback) and API routes (enforcement): `lib/validation.ts` and `lib/pricing.ts`. One source of truth — rules run twice, client for UX, server for trust.

**Validation rules:**
- **Name:** trim, then `/^[A-Za-z ]+$/`, 2–40 chars. Spaces-only input fails after trim with a specific message.
- **Phone:** `/^[6-9]\d{9}$/` — exactly 10 digits, starts 6–9.
- **Quantity:** integer 1–10. Rejects 0, 11+, negatives, floats ("2.5"), strings ("three"), empty. Client uses stepper UI plus typed-input parsing; server re-checks with `Number.isInteger`.
- **Order shape:** exactly 1 base + 1 pizza + 0..N toppings; every id must exist in the DB. Server verifies against menu tables and ignores any client-sent prices entirely.
- **Payment mode:** `cash | card | upi` only.
- **table_id:** from query param; validated non-empty sane string; missing/invalid → table-picker screen.

**Bill math (`lib/pricing.ts`, pure functions):**

```
unitPrice = base + pizza + sum(toppings)
subtotal  = unitPrice × qty
discount  = qty >= 5 ? subtotal × 0.10 : 0
gst       = (subtotal − discount) × 0.18
total     = subtotal − discount + gst
```

All rupee amounts rounded to 2dp at each step. `DISCOUNT_THRESHOLD`, `DISCOUNT_RATE`, `GST_RATE` are named constants at the top of the file (the "change discount threshold live" demo question is a one-constant edit).

Server recomputes the entire bill from DB prices and stores its own numbers; the client bill preview is display-only.

## Realtime, Error Handling, UI

**Realtime:** kitchen subscribes to Postgres changes — `orders` (INSERT) and `waiter_calls` (INSERT/UPDATE). New orders slide in at the top of the feed. Waiter calls render as a distinct amber alert banner showing table + elapsed time, with an "Acknowledge" button that resolves it. Admin table live-refreshes on insert.

**Error handling:**
- Every API route wraps logic in try/catch → JSON `{ error: "friendly message" }` with correct status code. No stack traces to the client.
- Client fetch failure → inline toast ("Couldn't reach kitchen — check connection, try again"); cart/order state preserved so retry loses nothing.
- Supabase unreachable at page load → menu screen shows a retry state, never a blank page.
- All 8 assignment edge cases are covered by the validation rules above.

**UI language:** dark-first, near-black background, single electric-orange accent, glassmorphism cards, Framer Motion page transitions and cart slide-ins, large touch targets (phone-first). Persistent floating "Call Waiter" button bottom-right on every post-login customer screen. Bill renders as an animated itemized receipt.

## Testing

- Vitest unit tests on `pricing.ts` and `validation.ts`: all 8 assignment edge cases, discount boundary (qty 4 vs 5), rounding.
- Manual end-to-end pass scripted as a demo checklist in the README.

## Out of Scope

Kitchen display hardware/printing, inventory tracking, native mobile app, multi-outlet support, session persistence/login memory, and all AI features (seams only — built in a later phase). Payment is mode selection only; no payment gateway integration.
