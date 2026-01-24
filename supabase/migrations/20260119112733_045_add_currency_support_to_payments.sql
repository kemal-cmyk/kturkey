/*
  # Add Currency Support to Payments Table
  
  ## Problem
  The payments table doesn't have currency_code and exchange_rate fields,
  so maintenance fee entries in currencies other than TRY fail to record
  the correct currency and conversion rate.
  
  ## Changes
  1. Add currency_code and exchange_rate columns to payments table
  2. Update apply_unit_payment function to accept currency parameters
  3. Update create_ledger_for_payment trigger to use payment's currency
  
  ## Impact
  - Maintenance fee payments can now be recorded in any currency
  - Exchange rates are properly tracked from payment to ledger
  - Backward compatible - defaults to TRY with rate 1.0
*/

-- Step 1: Add currency fields to payments table
ALTER TABLE payments 
ADD COLUMN IF NOT EXISTS currency_code text DEFAULT 'TRY',
ADD COLUMN IF NOT EXISTS exchange_rate numeric DEFAULT 1.0,
ADD COLUMN IF NOT EXISTS amount_reporting_try numeric;

-- Step 2: Calculate amount_reporting_try for existing records
UPDATE payments 
SET amount_reporting_try = amount * COALESCE(exchange_rate, 1.0)
WHERE amount_reporting_try IS NULL;

-- Step 3: Update apply_unit_payment function to accept currency parameters
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
    -- Calculate balance for this due
    v_due_balance := v_due.total_amount - v_due.paid_amount;
    
    -- Skip if already fully paid
    IF v_due_balance <= 0 THEN
      CONTINUE;
    END IF;
    
    -- Determine amount to apply to this due (in TRY)
    v_amount_to_apply := LEAST(v_remaining_amount, v_due_balance);
    
    -- Update due record
    v_new_paid_amount := v_due.paid_amount + v_amount_to_apply;
    v_new_status := CASE 
      WHEN v_new_paid_amount >= v_due.total_amount THEN 'paid'
      ELSE 'partial'
    END;
    
    UPDATE dues
    SET 
      paid_amount = v_new_paid_amount,
      status = v_new_status
    WHERE id = v_due.id;
    
    -- Track this application
    v_applied_dues := v_applied_dues || jsonb_build_object(
      'due_id', v_due.id,
      'month_date', v_due.month_date,
      'amount', v_amount_to_apply
    );
    
    -- Reduce remaining amount
    v_remaining_amount := v_remaining_amount - v_amount_to_apply;
    
    -- Exit if we've applied all the payment
    IF v_remaining_amount <= 0 THEN
      EXIT;
    END IF;
  END LOOP;
  
  -- Create payment record with currency information
  INSERT INTO payments (
    unit_id,
    amount,
    payment_date,
    payment_method,
    reference_no,
    applied_to_dues,
    account_id,
    category,
    currency_code,
    exchange_rate,
    amount_reporting_try
  ) VALUES (
    p_unit_id,
    p_payment_amount,
    p_payment_date,
    p_payment_method,
    p_reference_no,
    v_applied_dues,
    p_account_id,
    p_category,
    p_currency_code,
    p_exchange_rate,
    v_amount_reporting_try
  )
  RETURNING id INTO v_payment_id;
  
  -- Return result with payment details
  RETURN jsonb_build_object(
    'payment_id', v_payment_id,
    'amount_applied', v_amount_reporting_try - v_remaining_amount,
    'amount_remaining', v_remaining_amount,
    'applied_to_dues', v_applied_dues
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 4: Update create_ledger_for_payment trigger to use payment's currency
CREATE OR REPLACE FUNCTION create_ledger_for_payment()
RETURNS trigger AS $$
DECLARE
  v_site_id uuid;
  v_fiscal_period_id uuid;
  v_unit_info text;
  v_category text;
BEGIN
  -- Get unit's site_id and unit identifier
  SELECT 
    u.site_id,
    fp.id as fiscal_period_id,
    CASE 
      WHEN u.block IS NOT NULL THEN u.block || '-' || u.unit_number
      ELSE u.unit_number
    END as unit_identifier
  INTO v_site_id, v_fiscal_period_id, v_unit_info
  FROM units u
  LEFT JOIN fiscal_periods fp ON fp.site_id = u.site_id AND fp.status = 'active'
  WHERE u.id = NEW.unit_id;
  
  -- Use the category from the payment, default to 'Maintenance Fees' if not specified
  v_category := COALESCE(NEW.category, 'Maintenance Fees');
  
  -- Create corresponding ledger entry with currency fields from payment
  INSERT INTO ledger_entries (
    site_id,
    fiscal_period_id,
    entry_type,
    category,
    description,
    amount,
    currency_code,
    exchange_rate,
    amount_reporting_try,
    entry_date,
    created_by,
    payment_id,
    account_id
  ) VALUES (
    v_site_id,
    v_fiscal_period_id,
    'income',
    v_category,
    'Unit ' || v_unit_info || ' - ' || v_category || 
      CASE WHEN NEW.reference_no IS NOT NULL THEN ' (Ref: ' || NEW.reference_no || ')' ELSE '' END,
    NEW.amount,
    COALESCE(NEW.currency_code, 'TRY'),
    COALESCE(NEW.exchange_rate, 1.0),
    COALESCE(NEW.amount_reporting_try, NEW.amount),
    NEW.payment_date,
    NEW.created_by,
    NEW.id,
    NEW.account_id
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;