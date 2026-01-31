/*
  # Create Safe Force Delete Dues Function

  1. New Functions
    - `admin_force_delete_dues` - Safely deletes dues by first unlinking them from payments and ledger_entries
      - Parameters:
        - p_period_id (uuid) - Required: The fiscal period ID
        - p_description (text) - Optional: If provided, only deletes dues matching this exact description
      - Security: DEFINER mode to bypass RLS for admin operations
  
  2. Features
    - Unlinks dues from payments table (sets due_id to NULL)
    - Unlinks dues from ledger_entries table (sets due_id to NULL)
    - Then safely deletes the dues records
    - Can filter by description to delete only specific extra fees
    - Preserves payment history while removing the debt records
  
  3. Security
    - Function granted to authenticated and service_role users
    - Uses SECURITY DEFINER to bypass RLS for cleanup operations
*/

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS admin_force_delete_dues(uuid);
DROP FUNCTION IF EXISTS admin_force_delete_dues(uuid, text);

-- Create the safe deletion function with optional description filter
CREATE OR REPLACE FUNCTION admin_force_delete_dues(
    p_period_id uuid, 
    p_description text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Step 1: Unlink from payments table
  UPDATE payments 
  SET due_id = NULL 
  WHERE due_id IN (
    SELECT id FROM dues 
    WHERE fiscal_period_id = p_period_id
    AND (p_description IS NULL OR description = p_description)
  );

  -- Step 2: Unlink from ledger_entries table
  UPDATE ledger_entries 
  SET due_id = NULL 
  WHERE due_id IN (
    SELECT id FROM dues 
    WHERE fiscal_period_id = p_period_id
    AND (p_description IS NULL OR description = p_description)
  );

  -- Step 3: Delete the dues
  DELETE FROM dues
  WHERE fiscal_period_id = p_period_id
  AND (p_description IS NULL OR description = p_description);
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION admin_force_delete_dues(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_force_delete_dues(uuid, text) TO service_role;