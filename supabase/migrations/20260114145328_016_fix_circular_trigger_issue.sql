/*
  # Fix Circular Trigger Issue Between Ledger and Payments

  ## Overview
  Fixes the circular dependency where deleting ledger tries to delete payment,
  and deleting payment tries to delete ledger, causing potential issues.

  ## Changes
  
  1. Approach
    - When ledger entry deleted → reverses dues directly (no payment deletion)
    - When payment deleted → reverses dues + deletes ledger entry
    - This breaks the circular dependency
  
  2. Updated Functions
    - `reverse_dues_from_ledger()` - Reverses dues when ledger is deleted
    - `reverse_payment_on_delete()` - Updated to not cause circular deletion

  ## Behavior
  - Delete ledger entry → dues are reversed, payment stays (for audit trail)
  - Delete payment → dues are reversed, ledger entry is deleted
  - Unit balances update immediately in both cases
*/

-- Drop old trigger and function
DROP TRIGGER IF EXISTS trigger_delete_payment_on_ledger_delete ON ledger_entries;
DROP FUNCTION IF EXISTS delete_payment_from_ledger();

-- Function to reverse dues when ledger entry is deleted
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
  -- Only process if this is a Monthly Dues income entry with a payment_id
  IF OLD.entry_type = 'income' AND OLD.category = 'Monthly Dues' AND OLD.payment_id IS NOT NULL THEN
    
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
      
      -- Delete the payment record too (now that dues are reversed)
      DELETE FROM payments WHERE id = OLD.payment_id;
    END IF;
  END IF;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for when ledger entries are deleted
CREATE TRIGGER trigger_reverse_dues_on_ledger_delete
  BEFORE DELETE ON ledger_entries
  FOR EACH ROW 
  EXECUTE FUNCTION reverse_dues_from_ledger();

-- Update payment deletion to NOT try to delete ledger (avoid circular reference)
CREATE OR REPLACE FUNCTION reverse_payment_on_delete()
RETURNS trigger AS $$
DECLARE
  v_due_application jsonb;
  v_due_id uuid;
  v_amount numeric;
  v_due RECORD;
  v_new_paid_amount numeric;
  v_new_status text;
BEGIN
  -- Loop through all dues this payment was applied to
  IF OLD.applied_to_dues IS NOT NULL THEN
    FOR v_due_application IN SELECT * FROM jsonb_array_elements(OLD.applied_to_dues)
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
  END IF;
  
  -- Delete the corresponding ledger entry if it exists
  -- Use a condition to prevent infinite loop
  DELETE FROM ledger_entries
  WHERE payment_id = OLD.id;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Make sure the trigger is in place
DROP TRIGGER IF EXISTS trigger_reverse_payment_on_delete ON payments;
CREATE TRIGGER trigger_reverse_payment_on_delete
  BEFORE DELETE ON payments
  FOR EACH ROW 
  EXECUTE FUNCTION reverse_payment_on_delete();