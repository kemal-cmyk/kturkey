/*
  # Fix Unit Balance Calculation to Use Dues Table

  ## Overview
  The unit balance calculation was incorrect because it was only counting ledger entries
  instead of using the dues table which is the source of truth for what units owe and have paid.

  ## Correct Formula
  Balance = Opening Balance + Total Dues - Total Paid
  - Opening balance: Previous period debt (positive = owes)
  - Total dues: Sum of all dues.total_amount for the unit
  - Total paid: Sum of all dues.paid_amount for the unit
  - Positive balance = unit owes money
  - Negative balance = unit has credit/overpayment

  ## Example for Unit 1:
  - Opening balance: 10,000 TL
  - Total dues: 120,000 TL (12 months)
  - Total paid: 75,000 TL
  - Current balance: 10,000 + 120,000 - 75,000 = 55,000 TL (owes 55,000)

  ## Changes
  1. Updated View: `unit_balances_from_ledger`
     - Now uses dues table as source of truth
     - Calculates: opening_balance + total_dues - total_paid
     - Returns correct balance reflecting actual debt
*/

-- Recreate view with correct calculation using dues table
CREATE OR REPLACE VIEW unit_balances_from_ledger AS
SELECT 
  u.id as unit_id,
  u.unit_number,
  u.block,
  u.opening_balance,
  COALESCE(SUM(d.total_amount), 0) as total_maintenance_fees,
  u.opening_balance + COALESCE(SUM(d.total_amount), 0) - COALESCE(SUM(d.paid_amount), 0) as current_balance,
  u.site_id,
  u.created_at,
  u.updated_at
FROM units u
LEFT JOIN dues d ON d.unit_id = u.id
GROUP BY u.id, u.unit_number, u.block, u.opening_balance, u.site_id, u.created_at, u.updated_at;

-- Grant access to authenticated users
GRANT SELECT ON unit_balances_from_ledger TO authenticated;
