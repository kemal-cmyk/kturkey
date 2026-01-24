/*
  # Fix Circular Delete Loop Between Ledger and Payments

  ## Overview
  Fixes the infinite recursion that occurs when deleting ledger entries.
  The problem: ledger delete → payment delete → ledger delete → infinite loop

  ## Changes
  
  1. Strategy
    - Ledger delete: Only reverses dues, does NOT delete payment
    - Payment delete: Reverses dues AND deletes ledger (one-way only)
  
  2. Updated Function: reverse_dues_from_ledger()
    - Removes the payment deletion that caused the circular reference
    - Only reverses the dues records
    - Payment record stays for audit trail when ledger is deleted manually

  ## Behavior After Fix
  - Delete ledger entry manually → dues reversed, payment stays
  - Delete payment → dues reversed + ledger deleted (normal cascade)
  - No more infinite loops or stack overflows
*/

-- Fix the function to NOT delete payment (breaking the circular loop)
CREATE OR REPLACE FUNCTION reverse_dues_from_ledger()
RETURNS trigger AS $$
DECLARE
  v_payment RECORD;
  v_due_application jsonb;
  v_due_id uuid;
  v_amount numeric;
  v_due RECORD;
  v_new_paid_amount numeric;
  v_new_status text;
BEGIN
  -- Only process if this is a payment-linked entry
  IF OLD.payment_id IS NOT NULL THEN
    
    -- Get the payment details
    SELECT * INTO v_payment
    FROM payments
    WHERE id = OLD.payment_id;
    
    IF FOUND AND v_payment.applied_to_dues IS NOT NULL THEN
      -- Loop through all dues this payment was applied to
      FOR v_due_application IN SELECT * FROM jsonb_array_elements(v_payment.applied_to_dues)
      LOOP
        v_due_id := (v_due_application->>'due_id')::uuid;
        v_amount := (v_due_application->>'amount')::numeric;
        
        -- Get current due information
        SELECT id, total_amount, paid_amount, status
        INTO v_due
        FROM dues
        WHERE id = v_due_id;
        
        IF FOUND THEN
          -- Reverse the payment
          v_new_paid_amount := GREATEST(v_due.paid_amount - v_amount, 0);
          
          -- Update status
          v_new_status := CASE
            WHEN v_new_paid_amount <= 0 THEN 'pending'
            WHEN v_new_paid_amount >= v_due.total_amount THEN 'paid'
            ELSE 'partial'
          END;
          
          UPDATE dues
          SET 
            paid_amount = v_new_paid_amount,
            status = v_new_status
          WHERE id = v_due_id;
        END IF;
      END LOOP;
      
      -- DO NOT delete the payment here - that would cause circular deletion
      -- The payment stays for audit trail purposes
    END IF;
  END IF;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure trigger exists
DROP TRIGGER IF EXISTS trigger_reverse_dues_on_ledger_delete ON ledger_entries;
CREATE TRIGGER trigger_reverse_dues_on_ledger_delete
  BEFORE DELETE ON ledger_entries
  FOR EACH ROW 
  EXECUTE FUNCTION reverse_dues_from_ledger();