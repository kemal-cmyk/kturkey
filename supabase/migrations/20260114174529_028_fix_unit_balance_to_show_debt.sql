/*
  # Fix Unit Balance to Show Debt Correctly

  ## Problem
  The `unit_balances_from_ledger` view was calculating balance as:
    opening_balance - total_maintenance_fees (payments)
  
  This shows a cash position, but Units page needs to show DEBT (what units OWE):
    opening_balance + total_dues - total_paid
  
  For example:
  - Opening balance: -55,000 TL (unit owes from previous period)
  - Total dues this period: 25,200 TL
  - Total paid: 0 TL
  - **Correct balance should be**: -55,000 - 25,200 = -80,200 TL (negative = debt)

  ## Changes
  
  1. Recreate `unit_balances_from_ledger` view
    - Calculate balance as: opening_balance + SUM(dues.total_amount) - SUM(dues.paid_amount)
    - Show total_dues (what was charged)
    - Show total_paid (what was received via payments/ledger)
    - Show current_balance (total debt remaining)
  
  2. Rename fields for clarity
    - Keep opening_balance (debt from previous period, negative if owed)
    - Change total_maintenance_fees → total_dues (what is charged this period)
    - Change calculation to show debt properly
  
  ## Impact
  - Units page will correctly show debt balances
  - Financial summary will reflect actual outstanding amounts
  - Negative balance = unit owes money
  - Positive balance = unit has credit (prepaid)
*/

-- Drop and recreate unit_balances_from_ledger with correct debt calculation
DROP VIEW IF EXISTS unit_balances_from_ledger;

CREATE VIEW unit_balances_from_ledger AS
SELECT 
  u.id as unit_id,
  u.unit_number,
  u.block,
  u.opening_balance,
  COALESCE(SUM(d.total_amount), 0) as total_dues,
  COALESCE(SUM(d.paid_amount), 0) as total_paid,
  u.opening_balance + COALESCE(SUM(d.total_amount), 0) - COALESCE(SUM(d.paid_amount), 0) as current_balance,
  u.site_id
FROM units u
LEFT JOIN dues d ON d.unit_id = u.id
GROUP BY u.id, u.unit_number, u.block, u.opening_balance, u.site_id;
