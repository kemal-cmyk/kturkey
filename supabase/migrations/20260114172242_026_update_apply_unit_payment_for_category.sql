/*
  # Update apply_unit_payment to Accept Category

  ## Problem
  The apply_unit_payment function doesn't accept a category parameter,
  so all payments default to 'Monthly Dues' even when the user intends
  a different category like 'Maintenance Fees' or 'Extra Fees'.

  ## Changes
  
  1. Update apply_unit_payment function
    - Add p_category parameter with default 'Monthly Dues'
    - Store category in payment record
  
  ## Impact
  - Users can now specify the category when making unit payments
  - Ledger entries will correctly reflect the intended category
  - Backward compatible (defaults to 'Monthly Dues' if not specified)
*/

-- Update apply_unit_payment function to accept and store category
CREATE OR REPLACE FUNCTION apply_unit_payment(
  p_unit_id uuid,
  p_payment_amount numeric,
  p_payment_date date,
  p_payment_method text DEFAULT 'bank_transfer',
  p_reference_no text DEFAULT NULL,
  p_account_id uuid DEFAULT NULL,
  p_category text DEFAULT 'Monthly Dues'
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
