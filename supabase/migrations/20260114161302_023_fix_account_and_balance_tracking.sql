/*
  # Fix Account Selection and Balance Tracking

  ## Overview
  This migration fixes two critical issues:
  1. Ledger entries for maintenance fees were defaulting to the wrong account (first account instead of selected)
  2. Unit balances weren't updating because of category name mismatch

  ## Changes
  
  1. Payments Table
    - Add `account_id` column to store which account received the payment
  
  2. Updated Function: `apply_unit_payment()`
    - Now accepts `p_account_id` parameter to specify which account receives the payment
    - Stores the account_id in the payments table
  
  3. Updated Trigger: `create_ledger_for_payment()`
    - Uses the account_id from the payment record instead of selecting first account
    - Uses 'Monthly Dues' category to match the view expectations
  
  4. Updated View: `unit_balances_from_ledger`
    - Now includes both 'Monthly Dues' and 'Maintenance Fees' categories
    - Ensures all maintenance-related payments affect unit balances

  ## Impact
  - Maintenance fee payments will now correctly use the selected account
  - Unit balances will properly reflect all maintenance fee payments
  - No data loss - existing payments remain unchanged
*/

-- Add account_id column to payments table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payments' AND column_name = 'account_id'
  ) THEN
    ALTER TABLE payments ADD COLUMN account_id uuid REFERENCES accounts(id);
  END IF;
END $$;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_payments_account ON payments(account_id);

-- Update apply_unit_payment function to accept and store account_id
CREATE OR REPLACE FUNCTION apply_unit_payment(
  p_unit_id uuid,
  p_payment_amount numeric,
  p_payment_date date,
  p_payment_method text DEFAULT 'bank_transfer',
  p_reference_no text DEFAULT NULL,
  p_account_id uuid DEFAULT NULL
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
  
  -- Create payment record with account_id
  INSERT INTO payments (
    unit_id,
    amount,
    payment_date,
    payment_method,
    reference_no,
    applied_to_dues,
    account_id
  ) VALUES (
    p_unit_id,
    p_payment_amount,
    p_payment_date,
    p_payment_method,
    p_reference_no,
    v_applied_dues,
    p_account_id
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

-- Update trigger function to use payment's account_id and correct category
CREATE OR REPLACE FUNCTION create_ledger_for_payment()
RETURNS trigger AS $$
DECLARE
  v_site_id uuid;
  v_fiscal_period_id uuid;
  v_unit_info text;
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
  
  -- Create corresponding ledger entry with payment_id and account_id from payment
  INSERT INTO ledger_entries (
    site_id,
    fiscal_period_id,
    entry_type,
    category,
    description,
    amount,
    entry_date,
    created_by,
    payment_id,
    account_id
  ) VALUES (
    v_site_id,
    v_fiscal_period_id,
    'income',
    'Monthly Dues',
    'Unit ' || v_unit_info || ' - Payment' || 
      CASE WHEN NEW.reference_no IS NOT NULL THEN ' (Ref: ' || NEW.reference_no || ')' ELSE '' END,
    NEW.amount,
    NEW.payment_date,
    NEW.created_by,
    NEW.id,
    NEW.account_id
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update view to include both Monthly Dues and Maintenance Fees
CREATE OR REPLACE VIEW unit_balances_from_ledger AS
SELECT 
  u.id as unit_id,
  u.unit_number,
  u.block,
  u.opening_balance,
  COALESCE(SUM(
    CASE 
      WHEN le.entry_type = 'income' AND le.category IN ('Monthly Dues', 'Maintenance Fees')
      THEN le.amount 
      ELSE 0 
    END
  ), 0) as total_maintenance_fees,
  u.opening_balance - COALESCE(SUM(
    CASE 
      WHEN le.entry_type = 'income' AND le.category IN ('Monthly Dues', 'Maintenance Fees')
      THEN le.amount 
      ELSE 0 
    END
  ), 0) as current_balance,
  u.site_id,
  u.created_at,
  u.updated_at
FROM units u
LEFT JOIN payments p ON p.unit_id = u.id
LEFT JOIN ledger_entries le ON le.payment_id = p.id
GROUP BY u.id, u.unit_number, u.block, u.opening_balance, u.site_id, u.created_at, u.updated_at;
