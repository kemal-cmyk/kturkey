/*
  # Add Force Delete Dues Function

  1. New Functions
    - `admin_force_delete_dues(p_period_id uuid)` - Safely deletes all dues in a fiscal period
      - Automatically unlinks dues from payments table (sets due_id to NULL)
      - Automatically unlinks dues from ledger_entries table (sets due_id to NULL)
      - Deletes all dues for the specified fiscal period
      - Runs as atomic transaction (all or nothing)
  
  2. Security
    - Function uses SECURITY DEFINER to run with elevated privileges
    - This allows proper unlinking even if user doesn't have direct update rights
    - Payment and ledger history is preserved (only the link is broken)
  
  3. Notes
    - This solves the foreign key constraint issue when deleting paid dues
    - All operations are wrapped in a transaction automatically by plpgsql
*/

CREATE OR REPLACE FUNCTION admin_force_delete_dues(p_period_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 1. Unlink from PAYMENTS table
  -- Set due_id to NULL so payment records stay intact (preserving money tracking)
  -- but no longer point to the deleted debt
  UPDATE payments 
  SET due_id = NULL 
  WHERE due_id IN (
    SELECT id FROM dues WHERE fiscal_period_id = p_period_id
  );

  -- 2. Unlink from LEDGER_ENTRIES table
  -- Set due_id to NULL so ledger entries stay intact
  -- but no longer point to the deleted debt
  UPDATE ledger_entries 
  SET due_id = NULL 
  WHERE due_id IN (
    SELECT id FROM dues WHERE fiscal_period_id = p_period_id
  );

  -- 3. Now it's safe to DELETE the dues
  DELETE FROM dues
  WHERE fiscal_period_id = p_period_id;
  
  -- Note: If any step fails, the entire transaction is rolled back automatically
END;
$$;