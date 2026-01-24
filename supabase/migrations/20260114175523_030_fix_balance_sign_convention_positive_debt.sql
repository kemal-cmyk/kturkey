/*
  # Fix Balance Sign Convention - Positive = Debt
  
  ## Correct Sign Convention
  - **Positive balance = Unit owes money (debt)**
  - **Negative balance = Unit has credit (prepaid)**
  
  ## Formula Change
  NEW: Balance = -opening_balance + total_dues - total_paid
  
  This flips the entire sign convention to match the requirement.
  
  ## Examples with New Formula
  1. Unit owes money:
     - opening_balance: 0, total_dues: 25,200, total_paid: 0
     - Balance = -0 + 25,200 - 0 = **+25,200** (positive = debt) ✓
  
  2. Unit partially paid:
     - opening_balance: 0, total_dues: 25,200, total_paid: 10,000
     - Balance = -0 + 25,200 - 10,000 = **+15,200** (still owes 15,200) ✓
  
  3. Unit prepaid (has credit):
     - opening_balance: 0, total_dues: 25,200, total_paid: 30,000
     - Balance = -0 + 25,200 - 30,000 = **-4,800** (has credit) ✓
  
  4. Previous period debt (opening_balance stored as negative for debt):
     - opening_balance: -10,000 (meaning 10k debt from previous), total_dues: 120,000, total_paid: 75,000
     - Balance = -(-10,000) + 120,000 - 75,000 = 10,000 + 120,000 - 75,000 = **+55,000** (positive = debt) ✓
  
  5. Previous period credit (opening_balance stored as positive for credit):
     - opening_balance: 5,000 (meaning 5k credit from previous), total_dues: 10,000, total_paid: 0
     - Balance = -(5,000) + 10,000 - 0 = **+5,000** (positive = debt after using credit) ✓
  
  ## Opening Balance Field Interpretation
  Since balance now follows "positive=debt, negative=credit", the opening_balance field should be stored the SAME way:
  - Positive opening_balance = Previous period debt
  - Negative opening_balance = Previous period credit
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
  -u.opening_balance + COALESCE(SUM(d.total_amount), 0) - COALESCE(SUM(d.paid_amount), 0) as current_balance,
  u.site_id
FROM units u
LEFT JOIN dues d ON d.unit_id = u.id
GROUP BY u.id, u.unit_number, u.block, u.opening_balance, u.site_id;

-- Grant access to authenticated users
GRANT SELECT ON unit_balances_from_ledger TO authenticated;
