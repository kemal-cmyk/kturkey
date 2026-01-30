/*
  # Add Secure Opening Balance Function for Residents
  
  ## Problem
  Residents need to see the total opening balance on the dashboard, but they shouldn't
  have direct access to the sensitive `accounts` table which contains full bank details.
  
  ## Solution
  Create a secure helper function that:
  1. Runs with elevated privileges (SECURITY DEFINER)
  2. Calculates the total opening balance for a site
  3. Handles multi-currency conversion to TRY
  4. Returns only the aggregated number (not individual account details)
  
  ## Security
  - Function uses SECURITY DEFINER to access accounts table
  - Only returns aggregated sum, not individual account details
  - Granted to authenticated users (includes residents)
  
  ## Usage
  Residents can call: SELECT get_site_opening_balance('site-uuid')
  This gives them the total without exposing sensitive bank account information.
*/

-- Create a secure function to get total opening balance
-- This runs with "SECURITY DEFINER" privileges, allowing residents to get the SUM 
-- without needing direct access to the private 'accounts' table.
CREATE OR REPLACE FUNCTION get_site_opening_balance(p_site_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_total numeric;
BEGIN
    SELECT COALESCE(SUM(
        initial_balance * CASE 
            WHEN currency_code = 'TRY' THEN 1 
            ELSE COALESCE(initial_exchange_rate, 1) 
        END
    ), 0)
    INTO v_total
    FROM accounts
    WHERE site_id = p_site_id AND is_active = true;

    RETURN v_total;
END;
$$;

-- Grant permission to authenticated users (residents)
GRANT EXECUTE ON FUNCTION get_site_opening_balance TO authenticated;
