# Hive Client Portal

Customer-facing self-service portal. Warehouse clients sign in, see their own
stock, raise delivery requests and track fulfilment — without touching the
internal Hive or Brood portals.

Replaces the PSS (Permit & Shipping Services) module, which has been removed.

---

## Running the migrations

Order matters. Both run in the Supabase SQL Editor.

### 1. `supabase/drop_pss_module.sql` — destructive

Read the header before running it. It drops `pss_shipments` and
`pss_shipment_lines`.

It does **not** touch:

- `movements` / `stock_lines` — PSS created real inbound movements carrying
  real stock. That is inventory, not permit paperwork.
- `delivery_confirmations` — also used by Brood's Receive Delivery and Scan
  Client QR flows.

Section 1 of the file is an archive `SELECT`. Run it and keep the output before
going any further — the consignee names and addresses in there are the only
part of the PSS data the portal has a use for, and §2 can lift them into saved
delivery addresses.

### 2. `supabase/client_portal_schema.sql`

Creates the portal schema, RLS policies and functions. Safe to re-run —
everything is `IF NOT EXISTS` / `CREATE OR REPLACE`.

Section 10 holds the backfill for existing stock. It is **commented out on
purpose**: historic stock is keyed on `movements.company_name` as free text, so
running it blind creates one client account per spelling variant. Deduplicate
the company names first.

---

## Creating a client account

1. **Supabase Dashboard → Authentication → Users → Add user.** Use the
   customer's real email and tick "Auto Confirm User".

2. **Create the client and link the user:**

```sql
INSERT INTO clients (code, name, legacy_company_name, contact_email)
VALUES ('OKI', 'Oki Ara Pte Ltd', 'Oki Ara Pte Ltd', 'ops@okiara.com')
RETURNING id;

INSERT INTO client_users (user_id, client_id, full_name)
VALUES ('<auth-user-uuid>', '<client-uuid>', 'Jane Tan');
```

3. Sign in at `/portal`.

A user with no `client_users` row is signed straight back out — internal staff
accounts can't wander into the portal by accident.

### Seeding stock for testing

```sql
SELECT staff_receive_stock(
  p_client_id     => '<client-uuid>',
  p_sku           => 'OKI-500',
  p_qty           => 1000,
  p_received_date => '2026-09-01',
  p_description   => 'Oki Ara 500ml',
  p_unit          => 'carton',
  p_expiry_date   => '2027-12-15'   -- omit entirely for non-dated products
);
```

---

## How stock is modelled

The brief's core complaint was that stock is tracked by individual cargo
movement rather than by customer account. That is fixed by moving the source of
truth:

```
clients ─┬─ client_products (the SKU catalogue)
         │        │
         │        └─ stock_batches ──── one row per physical receipt
         │             · received_date  (ACTUAL warehouse receiving date)
         │             · batch_no       (optional)
         │             · expiry_date    (optional)
         │             · qty_received / allocated / dispatched
         │             · qty_available  (generated, never written by hand)
         │             · movement_id    → provenance only, not identity
         │
         └─ client_orders ── client_order_lines ── stock_allocations → batch
```

`client_stock_summary` rolls batches up to one row per SKU — that is what the
client's Inventory screen reads.

Expiry is optional at both levels: `client_products.track_expiry` and a
nullable `stock_batches.expiry_date`. The UI renders "N/A", not a blank.

### Why allocation is a table

`stock_allocations` records which batch each ordered unit is reserved against.
That is what makes available balance correct the moment an order is submitted,
lets a cancellation put stock back exactly where it came from, and makes
dispatch a bookkeeping move rather than a recount.

Allocation is FEFO — earliest expiry first, then earliest receipt.

---

## Security model

**Clients hold no write grant on any table.** There is no
`GRANT INSERT/UPDATE/DELETE ... TO authenticated` anywhere in the schema. Every
client write goes through a `SECURITY DEFINER` function:

| Function                        | Does                                                         |
| ------------------------------- | ------------------------------------------------------------ |
| `portal_create_order(...)`      | Validates stock, allocates FEFO, schedules — one transaction   |
| `portal_cancel_order(...)`      | Releases allocation; only while the order is still `New`       |
| `portal_preview_delivery_date()`| The date the client is shown before committing                 |

Reads are RLS-scoped to `current_client_id()`, resolved from the JWT. The
frontend never filters by client id — a bug in the React code cannot widen what
comes back.

### ⚠️ Known gap: the internal apps still use the anon key

Hive and Brood connect with the public `anon` key and no auth session, exactly
as they already do against `movements`, `stock_lines` and `pick_lists` (all of
which carry `USING (true)` policies today).

So the new tables carry matching interim policies, every one named
`*_anon_interim`, plus anon grants. **Anyone holding the anon key can read all
client orders and stock.** This is the same exposure the database already has,
and it does not affect client *logins* — those are properly isolated either
way — but it should not ship to production as-is.

To close it: create `staff_users` rows, move Hive and Brood onto Supabase Auth,
then drop every `*_anon_interim` policy and the anon grants. The staff policies
they'll fall back on are already written.

---

## Delivery cut-off

`delivery_settings` holds one global row (`client_id IS NULL`, default 13:00
Asia/Singapore) plus optional per-client overrides. `delivery_blackout_dates`
holds holidays.

`next_delivery_date(client_id, submitted_at)` applies: past cut-off → next day,
then `lead_days` in business days, then roll forward off any non-working day.

Both the portal's preview and order creation call the same function, so the
date the client is shown before submitting is the date they get.

Changing the cut-off:

```sql
UPDATE delivery_settings SET cutoff_time = '14:00' WHERE client_id IS NULL;
```

An admin UI for this is still to be built.

---

## Order lifecycle

```
New ─→ Confirmed ─→ Picking ─→ Packed ─→ Out for Delivery ─→ Completed
 │         │
 │         └─ staff_confirm_order() creates an Outbound movement + stock_lines,
 │            so the existing pick-list flow runs unchanged
 └─ portal_cancel_order() — client-cancellable only at this point
```

`staff_dispatch_order()` converts allocation to dispatch on each source batch.

Confirm and dispatch are wired in the schema but **not yet called from the Hive
UI** — see below.

---

## State of the MVP

Built:

1. ✅ Client accounts and permissions — `clients`, `client_users`, RLS
2. ✅ Customer-specific stock visibility — `/portal/inventory`, batch drill-down
3. ✅ Receiving date field — `stock_batches.received_date`
4. ✅ Optional expiry field — nullable, `track_expiry` per product
6. ✅ PO / DO generation — `next_document_no()`, `ORD-2026-0001` / `DO-2026-0001`
7. ✅ Stock validation and allocation — `portal_create_order`, FEFO
9. ✅ Delivery cut-off logic — `next_delivery_date()`, configurable
11. ✅ Client order history — `/portal/orders`, live status via realtime

Still to build:

5. ⬜ **Client order creation UI** — `/portal/orders/new` is a placeholder. The
   server side is done and `useClientOrders().createOrder()` calls it; what's
   missing is the form: product picker with live available quantities,
   delivery details, cut-off preview, confirmation.
8. ⬜ **Warehouse fulfilment notification** — a "New Fulfilment Requests" queue
   in Hive/Brood calling `staff_confirm_order()`, and status writeback from the
   pick-list flow to `client_orders.status`.
10. ⬜ **Order detail screen** — `/portal/orders/:id` with the status timeline
   from `client_order_events`.
- ⬜ **Admin UI for cut-off settings** — SQL-only today.
- ⬜ **Receiving integration** — Brood's Receive Delivery should call
  `staff_receive_stock()` so batches are created as goods land. Right now stock
  only reaches the portal via the backfill or a manual call.
- ⬜ **Shopify** — `client_orders.source` / `external_order_id` and the unique
  constraint are in place, so a webhook can create orders through the same
  function. Nothing is wired up.

---

## Files

```
supabase/client_portal_schema.sql   schema, RLS, functions
supabase/drop_pss_module.sql        PSS removal (destructive — read first)

src/context/ClientAuthContext.jsx   Supabase Auth session + client resolution
src/hooks/useClientStock.js         stock summary + batch detail
src/hooks/useClientOrders.js        order history, create, cancel, cut-off preview

src/pages/portal/PortalLayout.jsx   shell + auth guard
src/pages/portal/PortalLogin.jsx    email/password + password reset
src/pages/portal/PortalDashboard.jsx
src/pages/portal/PortalInventory.jsx
src/pages/portal/PortalOrders.jsx
src/pages/portal/PortalOrderNew.jsx placeholder

backup/pss-module-2026-09-17.tgz    the removed PSS files
```

The project is not under version control, so the removed PSS module was
archived to `backup/` rather than deleted outright. Delete it once you're happy.
Worth running `git init` before the next change of this size.
