/*
  # Make Force Delete Dues Case-Insensitive

  1. Changes
    - Updates `admin_force_delete_dues` function to use case-insensitive matching
    - Uses LOWER(TRIM(description)) to ignore capitalization and extra spaces
    - Ensures "Roof Repair", "roof repair", and " ROOF REPAIR " are all treated as the same
  
  2. Behavior
    - When p_description is provided, matches are case-insensitive
    - Trims whitespace before comparison
    - Unlinks from payments and ledger_entries before deletion
    - Preserves payment history while removing debt records
  
  3. Security
    - Function granted to authenticated and service_role users
    - Uses SECURITY DEFINER to bypass RLS for cleanup operations
*/

-- Drop existing function
DROP FUNCTION IF EXISTS admin_force_delete_dues(uuid, text);

-- Create case-insensitive version
CREATE OR REPLACE FUNCTION admin_force_delete_dues(
    p_period_id uuid, 
    p_description text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Step 1: Unlink from payments (Case-Insensitive Match)
  UPDATE payments 
  SET due_id = NULL 
  WHERE due_id IN (
    SELECT id FROM dues 
    WHERE fiscal_period_id = p_period_id
    AND (
        p_description IS NULL 
        OR LOWER(TRIM(description)) = LOWER(TRIM(p_description))
    )
  );

  -- Step 2: Unlink from ledger_entries (Case-Insensitive Match)
  UPDATE ledger_entries 
  SET due_id = NULL 
  WHERE due_id IN (
    SELECT id FROM dues 
    WHERE fiscal_period_id = p_period_id
    AND (
        p_description IS NULL 
        OR LOWER(TRIM(description)) = LOWER(TRIM(p_description))
    )
  );

  -- Step 3: Delete the dues (Case-Insensitive Match)
  DELETE FROM dues
  WHERE fiscal_period_id = p_period_id
  AND (
      p_description IS NULL 
      OR LOWER(TRIM(description)) = LOWER(TRIM(p_description))
  );
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION admin_force_delete_dues(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_force_delete_dues(uuid, text) TO service_role;