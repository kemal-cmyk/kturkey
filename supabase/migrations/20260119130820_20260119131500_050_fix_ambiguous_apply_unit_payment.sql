/*
  # Fix Ambiguous apply_unit_payment Function

  ## Problem
  Multiple versions of apply_unit_payment exist with similar signatures:
  - 5 parameters (migration 011)
  - 6 parameters (migration 023)
  - 7 parameters (migrations 026, 027)
  - 9 parameters (migration 045 - with currency support)
  
  When calling with 7 parameters, PostgreSQL can't determine which function to use.

  ## Solution
  1. Drop all old versions of apply_unit_payment
  2. Keep only the latest currency-aware version (9 parameters)
  3. Update set_unit_monthly_due to call with correct parameters including currency

  ## Changes
  - Drop all old versions of apply_unit_payment
  - Update set_unit_monthly_due to pass currency_code and exchange_rate
*/

-- Drop all old versions of apply_unit_payment
DROP FUNCTION IF EXISTS apply_unit_payment(uuid, numeric, date, text, text);
DROP FUNCTION IF EXISTS apply_unit_payment(uuid, numeric, date, text, text, uuid);
DROP FUNCTION IF EXISTS apply_unit_payment(uuid, numeric, date, text, text, uuid, text);

-- Recreate the latest version with currency support (from migration 045)
CREATE OR REPLACE FUNCTION apply_unit_payment(
  p_unit_id uuid,
  p_payment_amount numeric,
  p_payment_date date,
  p_payment_method text DEFAULT 'bank_transfer',
  p_reference_no text DEFAULT NULL,
  p_account_id uuid DEFAULT NULL,
  p_category text DEFAULT 'Maintenance Fees',
  p_currency_code text DEFAULT 'TRY',
  p_exchange_rate numeric DEFAULT 1.0
) RETURNS jsonb AS $$
DECLARE
  v_remaining_amount numeric;
  v_due RECORD;
  v_applied_dues jsonb := '[]'::jsonb;
  v_amount_to_apply numeric;
  v_due_balance numeric;
  v_new_paid_amount numeric;
  v_new_status text;
  v_payment_id uuid;
  v_amount_reporting_try numeric;
BEGIN
  -- Validate payment amount
  IF p_payment_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero';
  END IF;
  
  -- Calculate amount in reporting currency (TRY)
  v_amount_reporting_try := p_payment_amount * p_exchange_rate;
  v_remaining_amount := v_amount_reporting_try;
  
  -- Loop through unpaid/partial dues in chronological order
  FOR v_due IN 
    SELECT id, month_date, total_amount, paid_amount
    FROM dues
    WHERE unit_id = p_unit_id
      AND status IN ('pending', 'partial', 'overdue')
    ORDER BY month_date ASC
  LOOP
    EXIT WHEN v_remaining_amount <= 0;
    
    v_due_balance := v_due.total_amount - v_due.paid_amount;
    v_amount_to_apply := LEAST(v_remaining_amount, v_due_balance);
    
    -- Update due record
    v_new_paid_amount := v_due.paid_amount + v_amount_to_apply;
    v_new_status := CASE 
      WHEN v_new_paid_amount >= v_due.total_amount THEN 'paid'
      ELSE 'partial'
    END;
    
    UPDATE dues 
    SET paid_amount = v_new_paid_amount,
        status = v_new_status
    WHERE id = v_due.id;
    
    -- Track applied dues
    v_applied_dues := v_applied_dues || jsonb_build_object(
      'due_id', v_due.id,
      'month_date', v_due.month_date,
      'amount_applied', v_amount_to_apply
    );
    
    v_remaining_amount := v_remaining_amount - v_amount_to_apply;
  END LOOP;
  
  -- Create payment record with currency information
  INSERT INTO payments (
    unit_id,
    amount,
    payment_date,
    payment_method,
    reference_no,
    account_id,
    category,
    currency_code,
    exchange_rate,
    amount_reporting_try
  )
  VALUES (
    p_unit_id,
    p_payment_amount,
    p_payment_date,
    p_payment_method,
    p_reference_no,
    p_account_id,
    p_category,
    p_currency_code,
    p_exchange_rate,
    v_amount_reporting_try
  )
  RETURNING id INTO v_payment_id;
  
  RETURN jsonb_build_object(
    'payment_id', v_payment_id,
    'total_amount', p_payment_amount,
    'currency_code', p_currency_code,
    'amount_reporting_try', v_amount_reporting_try,
    'applied_dues', v_applied_dues,
    'overpayment', v_remaining_amount
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update set_unit_monthly_due to call with currency parameters
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
  v_payment_rates numeric[];
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
    array_agg(COALESCE(currency_code, 'TRY') ORDER BY payment_date, created_at),
    array_agg(COALESCE(exchange_rate, 1.0) ORDER BY payment_date, created_at)
  INTO 
    v_payment_amounts,
    v_payment_dates,
    v_payment_methods,
    v_payment_refs,
    v_payment_accounts,
    v_payment_categories,
    v_payment_currencies,
    v_payment_rates
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
  
  -- Re-apply all existing payments with their original currency
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
        COALESCE(v_payment_categories[v_idx], 'Maintenance Fees'),
        COALESCE(v_payment_currencies[v_idx], 'TRY'),
        COALESCE(v_payment_rates[v_idx], 1.0)
      );
    END LOOP;
  END IF;
  
  RETURN v_dues_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
