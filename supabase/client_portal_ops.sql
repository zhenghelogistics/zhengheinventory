-- ============================================================
-- CLIENT PORTAL — ops loop
--
-- Run AFTER client_portal_schema.sql. Safe to re-run.
--
-- Closes the gap between a client submitting a request and that client
-- seeing it progress. Until now client_orders.status only ever moved when
-- someone called a function by hand.
--
-- The warehouse keeps working exactly as it does today: pick lists move
-- Pending → Picking → Checking → … → Completed in Brood. A trigger mirrors
-- that onto the client's order, so nobody has to remember to update two
-- places, and no Brood screen needs changing.
-- ============================================================

-- ── 1. Dispatch as a reusable step ────────────────────────────
-- Pulled out of staff_dispatch_order so the trigger can dispatch without
-- also forcing the order's status.

CREATE OR REPLACE FUNCTION dispatch_order_allocations(p_order_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a RECORD;
BEGIN
  FOR a IN
    SELECT sa.id, sa.batch_id, sa.qty, sa.order_line_id
      FROM stock_allocations sa
      JOIN client_order_lines l ON l.id = sa.order_line_id
     WHERE l.order_id = p_order_id AND sa.status = 'allocated'
     FOR UPDATE
  LOOP
    UPDATE stock_batches
       SET qty_allocated  = qty_allocated - a.qty,
           qty_dispatched = qty_dispatched + a.qty
     WHERE id = a.batch_id;

    UPDATE stock_allocations
       SET status = 'dispatched', dispatched_at = NOW() WHERE id = a.id;

    UPDATE client_order_lines
       SET qty_dispatched = qty_dispatched + a.qty WHERE id = a.order_line_id;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION dispatch_order_allocations(UUID) FROM PUBLIC;

CREATE OR REPLACE FUNCTION staff_dispatch_order(p_order_id UUID, p_actor TEXT DEFAULT 'Hive')
RETURNS client_orders LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ord  client_orders;
  prev TEXT;
BEGIN
  SELECT * INTO ord FROM client_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  prev := ord.status;

  PERFORM dispatch_order_allocations(p_order_id);

  UPDATE client_orders SET status = 'Out for Delivery'
   WHERE id = ord.id RETURNING * INTO ord;

  INSERT INTO client_order_events (order_id, from_status, to_status, actor)
  VALUES (ord.id, prev, 'Out for Delivery', 'staff:' || p_actor);

  RETURN ord;
END;
$$;

GRANT EXECUTE ON FUNCTION staff_dispatch_order(UUID, TEXT) TO anon, authenticated;

-- ── 2. Pick-list status → client order status ─────────────────

-- Where each warehouse state puts the client's order.
CREATE OR REPLACE FUNCTION map_pick_status(p_pick_status TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_pick_status
    WHEN 'Pending'            THEN 'Confirmed'
    WHEN 'Picking'            THEN 'Picking'
    WHEN 'Checking'           THEN 'Picking'
    WHEN 'Photo Pending'      THEN 'Packed'
    WHEN 'Admin Review'       THEN 'Packed'
    WHEN 'Awaiting Signature' THEN 'Out for Delivery'
    WHEN 'Completed'          THEN 'Completed'
    ELSE NULL
  END;
$$;

-- Rank on the client-facing track, so status can only move forwards. Without
-- this, a pick list bouncing back from Checking to Picking would drag the
-- client's order backwards and make the timeline lie.
CREATE OR REPLACE FUNCTION client_status_rank(p_status TEXT)
RETURNS INTEGER LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_status
    WHEN 'New'              THEN 0
    WHEN 'Confirmed'        THEN 1
    WHEN 'Picking'          THEN 2
    WHEN 'Packed'           THEN 3
    WHEN 'Out for Delivery' THEN 4
    WHEN 'Completed'        THEN 5
    WHEN 'Cancelled'        THEN 99
    ELSE -1
  END;
$$;

CREATE OR REPLACE FUNCTION sync_client_order_from_pick_list()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ord        client_orders;
  new_status TEXT;
BEGIN
  IF NEW.movement_id IS NULL THEN RETURN NEW; END IF;

  SELECT * INTO ord FROM client_orders
   WHERE movement_id = NEW.movement_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NEW; END IF;      -- an ordinary movement, not a portal order

  -- Remember which pick list belongs to this order.
  IF ord.pick_list_id IS DISTINCT FROM NEW.id THEN
    UPDATE client_orders SET pick_list_id = NEW.id WHERE id = ord.id;
  END IF;

  IF ord.status = 'Cancelled' THEN RETURN NEW; END IF;

  new_status := map_pick_status(NEW.status);
  IF new_status IS NULL THEN RETURN NEW; END IF;
  IF client_status_rank(new_status) <= client_status_rank(ord.status) THEN
    RETURN NEW;
  END IF;

  -- Goods physically leaving is what turns a reservation into a dispatch.
  IF new_status IN ('Out for Delivery', 'Completed') THEN
    PERFORM dispatch_order_allocations(ord.id);
  END IF;

  UPDATE client_orders SET status = new_status WHERE id = ord.id;

  INSERT INTO client_order_events (order_id, from_status, to_status, actor, note)
  VALUES (ord.id, ord.status, new_status, 'system',
          'Warehouse pick list moved to ' || NEW.status);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pick_lists_sync_client_order ON pick_lists;
CREATE TRIGGER pick_lists_sync_client_order
  AFTER INSERT OR UPDATE OF status ON pick_lists
  FOR EACH ROW EXECUTE FUNCTION sync_client_order_from_pick_list();

-- ── 3. Receiving stock straight from a stock line ─────────────
-- Brood records receipts on stock_lines. This turns one of those into a
-- client stock batch, so goods landing in the warehouse show up in the
-- client's portal balance.

CREATE OR REPLACE FUNCTION staff_receive_stock_line(
  p_stock_line_id UUID,
  p_client_id     UUID DEFAULT NULL,
  p_received_date DATE DEFAULT NULL,
  p_batch_no      TEXT DEFAULT NULL,
  p_expiry_date   DATE DEFAULT NULL
) RETURNS stock_batches LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  sl    stock_lines;
  mv    movements;
  cid   UUID;
  batch stock_batches;
BEGIN
  SELECT * INTO sl FROM stock_lines WHERE id = p_stock_line_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'STOCK_LINE_NOT_FOUND'; END IF;

  IF sl.batch_id IS NOT NULL THEN
    -- Already published to the portal; don't double-count on a re-confirm.
    SELECT * INTO batch FROM stock_batches WHERE id = sl.batch_id;
    RETURN batch;
  END IF;

  SELECT * INTO mv FROM movements WHERE id = sl.movement_id;

  -- Resolve the client: explicit → on the line → on the movement → matched
  -- from the movement's free-text company name.
  cid := COALESCE(
    p_client_id,
    sl.client_id,
    mv.client_id,
    (SELECT id FROM clients WHERE legacy_company_name = mv.company_name LIMIT 1)
  );
  IF cid IS NULL THEN
    RAISE EXCEPTION 'NO_CLIENT_FOR_MOVEMENT:%', mv.movement_no
      USING HINT = 'Set movements.client_id, or add a client whose legacy_company_name matches';
  END IF;

  IF COALESCE(sl.sku, '') = '' THEN
    RAISE EXCEPTION 'STOCK_LINE_HAS_NO_SKU'
      USING HINT = 'A portal SKU is required to track this against client stock';
  END IF;

  batch := staff_receive_stock(
    cid, sl.sku, sl.qty_actual,
    COALESCE(p_received_date, sl.received_date, sl.date_in, CURRENT_DATE),
    sl.description, sl.unit,
    COALESCE(p_batch_no, sl.batch_no),
    COALESCE(p_expiry_date, sl.expiry_date),
    sl.movement_id, sl.id);

  UPDATE stock_lines
     SET batch_id      = batch.id,
         client_id     = cid,
         received_date = batch.received_date,
         batch_no      = batch.batch_no,
         expiry_date   = batch.expiry_date
   WHERE id = sl.id;

  UPDATE movements SET client_id = cid WHERE id = sl.movement_id AND client_id IS NULL;

  RETURN batch;
END;
$$;

GRANT EXECUTE ON FUNCTION staff_receive_stock_line(UUID, UUID, DATE, TEXT, DATE)
  TO anon, authenticated;

-- ── 4. The ops queue ──────────────────────────────────────────
-- What Hive's Fulfilment Requests screen reads.

CREATE OR REPLACE VIEW fulfilment_requests AS
SELECT
  o.id, o.order_no, o.do_number, o.po_number, o.reference_no,
  o.status, o.scheduled_date, o.requested_date, o.submitted_at,
  o.consignee_name, o.delivery_address,
  o.delivery_contact_name, o.delivery_contact_phone,
  o.delivery_instructions, o.notes, o.source,
  o.movement_id, o.pick_list_id,
  c.id AS client_id, c.code AS client_code, c.name AS client_name,
  m.movement_no,
  pl.status AS pick_status,
  (SELECT COUNT(*) FROM client_order_lines l WHERE l.order_id = o.id) AS line_count,
  (SELECT COALESCE(SUM(l.qty_ordered), 0) FROM client_order_lines l WHERE l.order_id = o.id) AS total_qty
FROM client_orders o
JOIN clients c        ON c.id = o.client_id
LEFT JOIN movements m ON m.id = o.movement_id
LEFT JOIN pick_lists pl ON pl.id = o.pick_list_id;

ALTER VIEW fulfilment_requests SET (security_invoker = true);
GRANT SELECT ON fulfilment_requests TO anon, authenticated;
