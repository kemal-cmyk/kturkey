/*
  # Remove "Monthly Dues" from Payment Categories

  ## Overview
  Clarifies the distinction between:
  - `dues` table = Accrual-based debt tracking (what units OWE)
  - Payments/Ledger = Cash-based income tracking (what is RECEIVED)
  
  "Monthly Dues" should only exist in the `dues` table for debt calculation.
  Actual payments should be categorized as "Maintenance Fees" or other income types.

  ## Changes
  
  1. Update payments table default category
    - Change from 'Monthly Dues' to 'Maintenance Fees'
  
  2. Update apply_unit_payment function
    - Change default category from 'Monthly Dues' to 'Maintenance Fees'
  
  3. Update unit_balances_from_ledger view
    - Remove filtering by specific categories
    - Include ALL income entries linked to unit payments via payment_id
  
  4. Migrate existing data
    - Update all existing payments with 'Monthly Dues' to 'Maintenance Fees'
    - Update all existing ledger entries with 'Monthly Dues' to 'Maintenance Fees'
  
  ## Impact
  - Clearer separation between debt tracking (dues table) and income tracking (payments/ledger)
  - "Monthly Dues" no longer appears as a category option in UI
  - All existing records updated to use "Maintenance Fees" instead
*/

-- Step 1: Update existing ledger entries from 'Monthly Dues' to 'Maintenance Fees'
UPDATE ledger_entries
SET category = 'Maintenance Fees'
WHERE category = 'Monthly Dues' AND entry_type = 'income';

-- Step 2: Update existing payments from 'Monthly Dues' to 'Maintenance Fees'
UPDATE payments
SET category = 'Maintenance Fees'
WHERE category = 'Monthly Dues';

-- Step 3: Update payments table default category
ALTER TABLE payments 
ALTER COLUMN category SET DEFAULT 'Maintenance Fees';

-- Step 4: Update apply_unit_payment function to default to 'Maintenance Fees'
CREATE OR REPLACE FUNCTION apply_unit_payment(
  p_unit_id uuid,
  p_payment_amount numeric,
  p_payment_date date,
  p_payment_method text DEFAULT 'bank_transfer',
  p_reference_no text DEFAULT NULL,
  p_account_id uuid DEFAULT NULL,
  p_category text DEFAULT 'Maintenance Fees'
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
BEGIN
  -- Validate payment amount
  IF p_payment_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero';
  END IF;
  
  v_remaining_amount := p_payment_amount;
  
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
    
    -- Determine amount to apply to this due
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
  
  -- Create payment record with account_id and category
  INSERT INTO payments (
    unit_id,
    amount,
    payment_date,
    payment_method,
    reference_no,
    applied_to_dues,
    account_id,
    category
  ) VALUES (
    p_unit_id,
    p_payment_amount,
    p_payment_date,
    p_payment_method,
    p_reference_no,
    v_applied_dues,
    p_account_id,
    p_category
  )
  RETURNING id INTO v_payment_id;
  
  -- Return result with payment details
  RETURN jsonb_build_object(
    'payment_id', v_payment_id,
    'amount_applied', p_payment_amount - v_remaining_amount,
    'amount_remaining', v_remaining_amount,
    'applied_to_dues', v_applied_dues
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 5: Update create_ledger_for_payment trigger to default to 'Maintenance Fees'
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
  
  -- Create corresponding ledger entry
  INSERT INTO ledger_entries (
    site_id,
    fiscal_period_id,
    entry_type,
    category,
    description,
    amount,
    entry_date,
    created_by,
    payment_id
  ) VALUES (
    v_site_id,
    v_fiscal_period_id,
    'income',
    v_category,
    'Unit ' || v_unit_info || ' - ' || v_category || 
      CASE WHEN NEW.reference_no IS NOT NULL THEN ' (Ref: ' || NEW.reference_no || ')' ELSE '' END,
    NEW.amount,
    NEW.payment_date,
    NEW.created_by,
    NEW.id
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 6: Drop and recreate unit_balances_from_ledger view to include ALL income for unit payments
DROP VIEW IF EXISTS unit_balances_from_ledger;

CREATE VIEW unit_balances_from_ledger AS
SELECT 
  u.id as unit_id,
  u.unit_number,
  u.block,
  u.opening_balance,
  COALESCE(SUM(le.amount), 0) as total_maintenance_fees,
  u.opening_balance - COALESCE(SUM(le.amount), 0) as current_balance,
  u.site_id
FROM units u
LEFT JOIN payments p ON p.unit_id = u.id
LEFT JOIN ledger_entries le ON le.payment_id = p.id AND le.entry_type = 'income'
GROUP BY u.id, u.unit_number, u.block, u.opening_balance, u.site_id;
