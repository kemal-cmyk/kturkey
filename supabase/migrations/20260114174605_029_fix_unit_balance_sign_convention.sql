/*
  # Fix Unit Balance Sign Convention

  ## Problem
  The balance calculation was showing positive numbers for debt.
  Correct convention:
  - **Negative balance = Unit owes money (debt)**
  - **Positive balance = Unit has credit (prepaid)**

  ## Formula
  Balance = opening_balance - total_dues + total_paid
  
  ## Examples
  1. Unit owes:
     - opening_balance: 0, total_dues: 25,200, total_paid: 0
     - Balance = 0 - 25,200 + 0 = **-25,200** (negative = owes)
  
  2. Unit partially paid:
     - opening_balance: 0, total_dues: 25,200, total_paid: 10,000
     - Balance = 0 - 25,200 + 10,000 = **-15,200** (still owes 15,200)
  
  3. Unit prepaid:
     - opening_balance: 0, total_dues: 25,200, total_paid: 30,000
     - Balance = 0 - 25,200 + 30,000 = **+4,800** (has credit)
  
  4. Previous period debt:
     - opening_balance: -55,000, total_dues: 25,200, total_paid: 0
     - Balance = -55,000 - 25,200 + 0 = **-80,200** (total debt)

  ## Impact
  - Units page will show negative balances for units that owe money
  - Matches financial summary convention
*/

-- Fix unit_balances_from_ledger with correct sign convention
DROP VIEW IF EXISTS unit_balances_from_ledger;

CREATE VIEW unit_balances_from_ledger AS
SELECT 
  u.id as unit_id,
  u.unit_number,
  u.block,
  u.opening_balance,
  COALESCE(SUM(d.total_amount), 0) as total_dues,
  COALESCE(SUM(d.paid_amount), 0) as total_paid,
  u.opening_balance - COALESCE(SUM(d.total_amount), 0) + COALESCE(SUM(d.paid_amount), 0) as current_balance,
  u.site_id
FROM units u
LEFT JOIN dues d ON d.unit_id = u.id
GROUP BY u.id, u.unit_number, u.block, u.opening_balance, u.site_id;
