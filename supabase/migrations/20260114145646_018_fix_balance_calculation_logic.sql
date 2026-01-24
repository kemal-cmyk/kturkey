/*
  # Fix Unit Balance Calculation Logic

  ## Overview
  Corrects the balance calculation to properly reflect accounting principles:
  - Opening balance = debt owed from previous periods (positive = owes money)
  - Maintenance fee payments reduce the debt
  - Current balance = opening_balance - total_maintenance_fees_paid

  ## Changes
  
  1. Updated View: `unit_balances_from_ledger`
    - Now calculates: current_balance = opening_balance - total_maintenance_fees
    - Positive balance = unit owes money (debt)
    - Negative balance = unit has credit
  
  ## Example
  - Opening balance: 5000 (unit owes 5000)
  - Pays 1000 maintenance fee
  - Current balance: 5000 - 1000 = 4000 (unit now owes 4000)
*/

-- Recreate view with correct calculation
CREATE OR REPLACE VIEW unit_balances_from_ledger AS
SELECT 
  u.id as unit_id,
  u.unit_number,
  u.block,
  u.opening_balance,
  COALESCE(SUM(
    CASE 
      WHEN le.entry_type = 'income' AND le.category = 'Monthly Dues' 
      THEN le.amount 
      ELSE 0 
    END
  ), 0) as total_maintenance_fees,
  u.opening_balance - COALESCE(SUM(
    CASE 
      WHEN le.entry_type = 'income' AND le.category = 'Monthly Dues' 
      THEN le.amount 
      ELSE 0 
    END
  ), 0) as current_balance,
  u.site_id,
  u.created_at,
  u.updated_at
FROM units u
LEFT JOIN payments p ON p.unit_id = u.id
LEFT JOIN ledger_entries le ON le.payment_id = p.id
GROUP BY u.id, u.unit_number, u.block, u.opening_balance, u.site_id, u.created_at, u.updated_at;

-- Grant access to authenticated users
GRANT SELECT ON unit_balances_from_ledger TO authenticated;