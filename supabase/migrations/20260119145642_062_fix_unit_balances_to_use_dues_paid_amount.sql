/*
  # Fix Unit Balances to Use Dues Paid Amount Directly
  
  1. Problem
    - The view tries to calculate paid amount from ledger entries filtered by currency
    - Cross-currency payments don't match the filter (TRY payment for EUR dues)
    - Example: Unit 5 paid 40,000 TRY for EUR dues, but view filters le.currency_code = EUR
    - So the payment doesn't count, showing 0 paid even though dues show 800 EUR paid
    
  2. Solution
    - Use dues.paid_amount directly instead of recalculating from ledger
    - The dues table already has the correct paid amount in dues currency
    - This handles all currency conversions correctly
    
  3. Result
    - Unit balances show correct paid amounts regardless of payment currency
    - Works for same-currency and cross-currency payments
    - Consistent with dues table data
*/

CREATE OR REPLACE VIEW unit_balances_from_ledger AS
SELECT 
  u.id AS unit_id,
  u.unit_number,
  u.block,
  u.opening_balance,
  d.currency_code,
  COALESCE(SUM(d.total_amount), 0) AS total_dues,
  -- Use the paid_amount directly from dues table
  -- This already has the correct amount in dues currency, including cross-currency conversions
  COALESCE(SUM(d.paid_amount), 0) AS total_paid,
  -- Calculate balance: opening + dues - paid
  u.opening_balance + COALESCE(SUM(d.total_amount), 0) - COALESCE(SUM(d.paid_amount), 0) AS current_balance,
  u.site_id
FROM units u
LEFT JOIN dues d ON d.unit_id = u.id
GROUP BY u.id, u.unit_number, u.block, u.opening_balance, u.site_id, d.currency_code;
