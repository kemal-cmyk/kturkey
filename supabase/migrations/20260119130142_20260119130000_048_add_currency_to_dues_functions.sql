/*
  # Add Currency Parameter to Dues Functions
  
  ## Overview
  Updates the dues setup functions to accept a currency code parameter,
  allowing users to set monthly dues in their preferred currency.
  
  ## Changes
  
  1. **set_unit_monthly_due()**
    - Add `p_currency_code` parameter
    - Pass currency code when creating dues records
  
  2. **set_all_units_monthly_due()**
    - Add `p_currency_code` parameter
    - Forward currency code to set_unit_monthly_due
  
  3. **set_varied_unit_monthly_dues()**
    - Add `p_currency_code` parameter
    - Forward currency code to set_unit_monthly_due
  
  ## Important Notes
  - Functions now allow setting dues in any supported currency (TRY, EUR, USD, GBP, etc.)
  - The currency is stored with each due record for proper display and reporting
  - Exchange rates are handled at payment/ledger entry level
*/

-- Drop and recreate set_unit_monthly_due with currency parameter
DROP FUNCTION IF EXISTS set_unit_monthly_due(uuid, uuid, numeric);

CREATE OR REPLACE FUNCTION set_unit_monthly_due(
  p_unit_id uuid,
  p_fiscal_period_id uuid,
  p_monthly_amount numeric,
  p_currency_code text DEFAULT 'TRY'
) RETURNS integer AS $$
DECLARE
  v_site_id uuid;
  v_start_date date;
  v_end_date date;
  v_month_date date;
  v_dues_count integer := 0;
  v_payment RECORD;
  v_payment_amounts numeric[];
  v_payment_dates date[];
  v_payment_methods text[];
  v_payment_refs text[];
  v_payment_accounts uuid[];
  v_payment_categories text[];
  v_payment_currencies text[];
  v_idx integer := 1;
BEGIN
  -- Validate inputs
  IF p_monthly_amount < 0 THEN
    RAISE EXCEPTION 'Monthly amount cannot be negative';
  END IF;
  
  -- Get fiscal period dates
  SELECT site_id, start_date, end_date
  INTO v_site_id, v_start_date, v_end_date
  FROM fiscal_periods WHERE id = p_fiscal_period_id;
  
  -- Verify unit belongs to same site
  IF NOT EXISTS (
    SELECT 1 FROM units 
    WHERE id = p_unit_id AND site_id = v_site_id
  ) THEN
    RAISE EXCEPTION 'Unit does not belong to this fiscal period site';
  END IF;
  
  -- Store all existing payments for this unit in arrays
  SELECT 
    array_agg(amount ORDER BY payment_date, created_at),
    array_agg(payment_date ORDER BY payment_date, created_at),
    array_agg(payment_method ORDER BY payment_date, created_at),
    array_agg(reference_no ORDER BY payment_date, created_at),
    array_agg(account_id ORDER BY payment_date, created_at),
    array_agg(COALESCE(category, 'Maintenance Fees') ORDER BY payment_date, created_at),
    array_agg(COALESCE(currency_code, 'TRY') ORDER BY payment_date, created_at)
  INTO 
    v_payment_amounts,
    v_payment_dates,
    v_payment_methods,
    v_payment_refs,
    v_payment_accounts,
    v_payment_categories,
    v_payment_currencies
  FROM payments
  WHERE unit_id = p_unit_id;
  
  -- Delete existing payments and dues for this unit and period
  DELETE FROM payments WHERE unit_id = p_unit_id;
  
  DELETE FROM dues 
  WHERE unit_id = p_unit_id 
    AND fiscal_period_id = p_fiscal_period_id;
  
  -- Generate 12 months of dues with the specified amount and currency
  v_month_date := v_start_date;
  WHILE v_month_date < v_end_date LOOP
    INSERT INTO dues (
      unit_id, 
      fiscal_period_id, 
      month_date, 
      base_amount, 
      total_amount,
      due_date,
      currency_code
    )
    VALUES (
      p_unit_id,
      p_fiscal_period_id,
      v_month_date,
      p_monthly_amount,
      p_monthly_amount,
      v_month_date + interval '15 days',
      p_currency_code
    );
    
    v_dues_count := v_dues_count + 1;
    v_month_date := v_month_date + interval '1 month';
  END LOOP;
  
  -- Re-apply all existing payments
  IF v_payment_amounts IS NOT NULL THEN
    FOR v_idx IN 1..array_length(v_payment_amounts, 1)
    LOOP
      PERFORM apply_unit_payment(
        p_unit_id,
        v_payment_amounts[v_idx],
        v_payment_dates[v_idx],
        COALESCE(v_payment_methods[v_idx], 'bank_transfer'),
        v_payment_refs[v_idx],
        v_payment_accounts[v_idx],
        COALESCE(v_payment_categories[v_idx], 'Maintenance Fees')
      );
    END LOOP;
  END IF;
  
  RETURN v_dues_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop and recreate set_all_units_monthly_due with currency parameter
DROP FUNCTION IF EXISTS set_all_units_monthly_due(uuid, numeric);

CREATE OR REPLACE FUNCTION set_all_units_monthly_due(
  p_fiscal_period_id uuid,
  p_monthly_amount numeric,
  p_currency_code text DEFAULT 'TRY'
) RETURNS integer AS $$
DECLARE
  v_site_id uuid;
  v_unit RECORD;
  v_total_dues integer := 0;
  v_unit_dues integer;
BEGIN
  -- Get site for this fiscal period
  SELECT site_id INTO v_site_id
  FROM fiscal_periods WHERE id = p_fiscal_period_id;
  
  -- Loop through all units in the site
  FOR v_unit IN SELECT id FROM units WHERE site_id = v_site_id
  LOOP
    -- Set monthly due for this unit with the specified currency
    v_unit_dues := set_unit_monthly_due(
      v_unit.id, 
      p_fiscal_period_id, 
      p_monthly_amount,
      p_currency_code
    );
    v_total_dues := v_total_dues + v_unit_dues;
  END LOOP;
  
  RETURN v_total_dues;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop and recreate set_varied_unit_monthly_dues with currency parameter
DROP FUNCTION IF EXISTS set_varied_unit_monthly_dues(uuid, jsonb);

CREATE OR REPLACE FUNCTION set_varied_unit_monthly_dues(
  p_fiscal_period_id uuid,
  p_unit_amounts jsonb,
  p_currency_code text DEFAULT 'TRY'
) RETURNS integer AS $$
DECLARE
  v_site_id uuid;
  v_unit_data jsonb;
  v_unit_id uuid;
  v_monthly_amount numeric;
  v_total_dues integer := 0;
  v_unit_dues integer;
BEGIN
  -- Get site for this fiscal period
  SELECT site_id INTO v_site_id
  FROM fiscal_periods WHERE id = p_fiscal_period_id;
  
  -- Loop through the unit amounts array
  FOR v_unit_data IN SELECT * FROM jsonb_array_elements(p_unit_amounts)
  LOOP
    v_unit_id := (v_unit_data->>'unit_id')::uuid;
    v_monthly_amount := (v_unit_data->>'monthly_amount')::numeric;
    
    -- Set monthly due for this unit with the specified currency
    v_unit_dues := set_unit_monthly_due(
      v_unit_id, 
      p_fiscal_period_id, 
      v_monthly_amount,
      p_currency_code
    );
    v_total_dues := v_total_dues + v_unit_dues;
  END LOOP;
  
  RETURN v_total_dues;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
