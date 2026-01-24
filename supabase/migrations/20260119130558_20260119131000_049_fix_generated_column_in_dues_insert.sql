/*
  # Fix Generated Column Error in Dues Insert

  ## Problem
  Migration 048 attempted to insert values into the `total_amount` column,
  which is a generated column (GENERATED ALWAYS AS base_amount + penalty_amount).
  PostgreSQL does not allow explicit values for generated columns.

  ## Solution
  Update set_unit_monthly_due function to remove total_amount from INSERT statement.
  The column will be automatically calculated by PostgreSQL.

  ## Changes
  - Fix set_unit_monthly_due() to not explicitly set total_amount
*/

-- Drop and recreate set_unit_monthly_due with fixed INSERT
DROP FUNCTION IF EXISTS set_unit_monthly_due(uuid, uuid, numeric, text);

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
  -- NOTE: total_amount is a generated column, so we don't set it explicitly
  v_month_date := v_start_date;
  WHILE v_month_date < v_end_date LOOP
    INSERT INTO dues (
      unit_id, 
      fiscal_period_id, 
      month_date, 
      base_amount,
      due_date,
      currency_code
    )
    VALUES (
      p_unit_id,
      p_fiscal_period_id,
      v_month_date,
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
