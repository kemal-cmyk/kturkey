/*
  # Simplify Dues Payment Logic
  
  1. Changes
    - Create function to automatically apply payments to earliest unpaid dues
    - Payment will automatically distribute across multiple months if needed
    - No need to select specific month - just unit and amount
  
  2. New Functionality
    - apply_unit_payment() function takes unit_id, amount, and payment details
    - Automatically finds unpaid dues ordered by month_date
    - Distributes payment across dues from earliest to latest
    - Returns array of applied dues with amounts
*/

-- Create function to automatically apply payment to unit's unpaid dues
CREATE OR REPLACE FUNCTION apply_unit_payment(
  p_unit_id uuid,
  p_payment_amount numeric,
  p_payment_date date,
  p_payment_method text DEFAULT 'bank_transfer',
  p_reference_no text DEFAULT NULL
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
    
    -- Skip if already fully paid (shouldn't happen with status filter, but safe check)
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
  
  -- Create payment record
  INSERT INTO payments (
    unit_id,
    amount,
    payment_date,
    payment_method,
    reference_no,
    applied_to_dues
  ) VALUES (
    p_unit_id,
    p_payment_amount,
    p_payment_date,
    p_payment_method,
    p_reference_no,
    v_applied_dues
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
