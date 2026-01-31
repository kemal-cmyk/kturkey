/*
  # Simplify Force Delete Dues Function

  1. Changes
    - Drops the previous version that tried to unlink from payments/ledger_entries
    - Creates a simpler version that directly deletes dues
    - Maintains case-insensitive matching using LOWER(TRIM(description))
    - Works with JSONB payment structure without foreign key constraints
  
  2. Behavior
    - Deletes dues matching the fiscal period and description (case-insensitive)
    - If p_description is NULL, deletes all dues for the period
    - No need to unlink payments since schema uses JSONB structure
  
  3. Security
    - Function granted to authenticated and service_role users
    - Uses SECURITY DEFINER to bypass RLS for cleanup operations
*/

-- Drop the previous version
DROP FUNCTION IF EXISTS admin_force_delete_dues(uuid, text);

-- Create the simplified fixed function
CREATE OR REPLACE FUNCTION admin_force_delete_dues(
    p_period_id uuid, 
    p_description text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Simply DELETE the dues
  -- Your schema uses JSONB for payments, so there is no hard Foreign Key blocking this
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