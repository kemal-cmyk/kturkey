/*
  # Fix unit balances view to calculate total_paid from actual payments

  1. Changes
    - Drop and recreate `unit_balances_from_ledger` view
    - Calculate `total_paid` from actual payment amounts instead of summing dues.paid_amount
    - This fixes the bug where payments applied to multiple dues via FIFO are counted multiple times
  
  2. Why This Fix is Needed
    - When a payment is applied to multiple months via FIFO, each dues record gets a paid_amount value
    - Summing paid_amount from all dues records counts the same payment multiple times
    - Example: 2100 EUR payment applied to 12 months = 25,200 EUR total (WRONG)
    - Should be: 2100 EUR total from actual payments (CORRECT)
*/

-- Drop the existing view
DROP VIEW IF EXISTS unit_balances_from_ledger;

-- Recreate the view with correct total_paid calculation
CREATE VIEW unit_balances_from_ledger AS
SELECT 
  u.id AS unit_id,
  u.unit_number,
  u.block,
  u.opening_balance,
  COALESCE(SUM(d.total_amount), 0) AS total_dues,
  -- Calculate total_paid from actual payments, not from dues.paid_amount
  COALESCE(
    (SELECT SUM(p.amount)
     FROM payments p
     WHERE p.unit_id = u.id
    ), 0
  ) AS total_paid,
  -- Current balance = opening + dues - actual payments
  u.opening_balance + COALESCE(SUM(d.total_amount), 0) - COALESCE(
    (SELECT SUM(p.amount)
     FROM payments p
     WHERE p.unit_id = u.id
    ), 0
  ) AS current_balance,
  u.site_id
FROM units u
LEFT JOIN dues d ON d.unit_id = u.id
GROUP BY u.id, u.unit_number, u.block, u.opening_balance, u.site_id;
