-- SKU & barcode architecture.
--   * internal SKU (semantic, per-store, case-insensitive unique) is separate from the
--     manufacturer barcode (GTIN, per-store unique, blank allowed)
--   * variant hierarchy columns
--   * atomic per-store SKU counter + generator RPC
-- Idempotent. Apply with the Supabase SQL editor or a direct pg connection.

BEGIN;

-- 1. Variant hierarchy. `barcode` and `is_active` already exist; IF NOT EXISTS keeps this re-runnable.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS barcode text,
  ADD COLUMN IF NOT EXISTS has_variants boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.products(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS variant_attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_no_self_parent;
ALTER TABLE public.products ADD CONSTRAINT products_no_self_parent CHECK (parent_id IS NULL OR parent_id <> id);

-- 2. Uniqueness. The older plain UNIQUE (store_id, sku) is case-sensitive and the older
--    UNIQUE (store_id, barcode) treats '' as a real value (two barcode-less products with
--    '' would collide) — both are replaced by the stricter/looser indexes below.
CREATE UNIQUE INDEX IF NOT EXISTS uq_store_sku_case_insensitive
  ON public.products (store_id, UPPER(sku));

CREATE UNIQUE INDEX IF NOT EXISTS uq_store_barcode
  ON public.products (store_id, barcode)
  WHERE barcode IS NOT NULL AND barcode <> '';

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS uq_product_store_sku;
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS uq_product_store_barcode;

-- 3. POS lookup: key columns + everything the catalog tile needs, for index-only scans.
CREATE INDEX IF NOT EXISTS idx_products_pos_lookup
  ON public.products (store_id, barcode, sku)
  INCLUDE (name, retail_price, current_stock, has_variants);

CREATE INDEX IF NOT EXISTS idx_products_parent ON public.products (parent_id) WHERE parent_id IS NOT NULL;

-- 4. Atomic counter. Only the SECURITY DEFINER function (and the service role) touch it.
CREATE TABLE IF NOT EXISTS public.store_sku_counters (
  store_id uuid PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
  last_sequence bigint NOT NULL DEFAULT 1000,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.store_sku_counters ENABLE ROW LEVEL SECURITY;

-- 5. Generator. INSERT .. ON CONFLICT DO UPDATE is a single atomic statement, so concurrent
--    callers serialize on the row lock and can never receive the same number.
--    Authorization is enforced inside the function because SECURITY DEFINER bypasses RLS:
--    without it any signed-in user (a cashier included) could burn any store's sequence.
--    Callers with no auth.uid() (service role / direct DB connection) are trusted.
CREATE OR REPLACE FUNCTION public.generate_next_store_sku(
  p_store_id uuid,
  p_prefix text DEFAULT 'SKU'
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next_val bigint;
  v_store_code text;
  v_clean_prefix text;
  v_role user_role;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    v_role := get_auth_role();
    IF NOT (
      v_role = 'super_admin'
      OR (v_role = 'store_manager' AND get_auth_store_id() = p_store_id)
    ) THEN
      RAISE EXCEPTION 'Not authorized to generate SKUs for this store' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT UPPER(code) INTO v_store_code FROM stores WHERE id = p_store_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown store %', p_store_id USING ERRCODE = '23503';
  END IF;
  IF v_store_code IS NULL OR v_store_code = '' THEN v_store_code := 'STR'; END IF;

  v_clean_prefix := UPPER(REGEXP_REPLACE(UPPER(COALESCE(p_prefix, '')), '[^A-Z0-9]', '', 'g'));
  IF LENGTH(v_clean_prefix) = 0 THEN v_clean_prefix := 'GEN'; END IF;

  INSERT INTO store_sku_counters (store_id, last_sequence)
  VALUES (p_store_id, 1001)
  ON CONFLICT (store_id)
  DO UPDATE SET last_sequence = store_sku_counters.last_sequence + 1, updated_at = now()
  RETURNING last_sequence INTO v_next_val;

  -- LPAD alone would silently TRUNCATE past 99999 (LPAD('100000',5,'0') = '10000') and
  -- re-issue an old number; widen instead.
  RETURN v_store_code || '-' || v_clean_prefix || '-' || LPAD(v_next_val::text, GREATEST(5, LENGTH(v_next_val::text)), '0');
END;
$$;

REVOKE ALL ON FUNCTION public.generate_next_store_sku(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_next_store_sku(uuid, text) TO authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
