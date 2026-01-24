/*
  # Make unit balances view currency-aware

  1. Changes
    - Drop and recreate `unit_balances_from_ledger` view
    - Add currency_code column to the view
    - Group by currency_code
    - Only sum payments that match the currency of the dues
  
  2. Why This Fix is Needed
    - Currently the view mixes currencies when calculating total_paid
    - Example: 44,200 TRY payment is added to EUR dues balance (WRONG)
    - Each currency should have its own balance calculation
    - Unit 10 should show separate rows for EUR and TRY balances
*/

-- Drop the existing view
DROP VIEW IF EXISTS unit_balances_from_ledger;

-- Recreate the view with currency awareness
CREATE VIEW unit_balances_from_ledger AS
SELECT 
  u.id AS unit_id,
  u.unit_number,
  u.block,
  u.opening_balance,
  d.currency_code,
  COALESCE(SUM(d.total_amount), 0) AS total_dues,
  -- Calculate total_paid from actual payments in the SAME currency
  COALESCE(
    (SELECT SUM(p.amount)
     FROM payments p
     WHERE p.unit_id = u.id
       AND p.currency_code = d.currency_code
    ), 0
  ) AS total_paid,
  -- Current balance = opening + dues - actual payments (same currency)
  u.opening_balance + COALESCE(SUM(d.total_amount), 0) - COALESCE(
    (SELECT SUM(p.amount)
     FROM payments p
     WHERE p.unit_id = u.id
       AND p.currency_code = d.currency_code
    ), 0
  ) AS current_balance,
  u.site_id
FROM units u
LEFT JOIN dues d ON d.unit_id = u.id
GROUP BY u.id, u.unit_number, u.block, u.opening_balance, u.site_id, d.currency_code;
