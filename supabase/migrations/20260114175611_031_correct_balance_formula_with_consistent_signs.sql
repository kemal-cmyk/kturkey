/*
  # Correct Balance Formula - Consistent Sign Convention
  
  ## Sign Convention (Applied Consistently)
  - **Positive = Debt (unit owes money)**
  - **Negative = Credit (unit has credit)**
  
  This applies to BOTH opening_balance AND current_balance fields.
  
  ## Correct Formula
  Balance = opening_balance + total_dues - total_paid
  
  ## Examples
  1. Unit with previous debt:
     - opening_balance: 10,000 (positive = previous debt)
     - total_dues: 120,000
     - total_paid: 75,000
     - Balance = 10,000 + 120,000 - 75,000 = **+55,000** (debt) ✓
  
  2. Unit with no opening balance:
     - opening_balance: 0
     - total_dues: 25,200
     - total_paid: 0
     - Balance = 0 + 25,200 - 0 = **+25,200** (debt) ✓
  
  3. Unit with previous credit:
     - opening_balance: -5,000 (negative = previous credit)
     - total_dues: 10,000
     - total_paid: 0
     - Balance = -5,000 + 10,000 - 0 = **+5,000** (debt after using credit) ✓
  
  4. Unit that prepaid:
     - opening_balance: 0
     - total_dues: 25,200
     - total_paid: 30,000
     - Balance = 0 + 25,200 - 30,000 = **-4,800** (credit) ✓
*/

-- Fix unit_balances_from_ledger with correct formula
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

-- Grant access to authenticated users
GRANT SELECT ON unit_balances_from_ledger TO authenticated;
