/*
  # Fix Budget to Only Track Expenses
  
  1. Problem
    - Budget actual_amount is being updated for ALL ledger entries (income + expense)
    - This makes budget reports show incorrect numbers
    - Budgets should only track expenses, not income
    
  2. Solution
    - Update triggers to only modify budget for expense entries
    - Filter by entry_type = 'expense'
    
  3. Example
    - Maintenance Fees income: Should NOT affect budget
    - Gardening expense: Should affect budget
*/

-- Fix the insert trigger to only track expenses
CREATE OR REPLACE FUNCTION update_budget_actual_on_ledger_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only update budget for EXPENSE entries (not income or transfers)
  IF NEW.entry_type = 'expense' 
     AND NEW.fiscal_period_id IS NOT NULL 
     AND NEW.category IS NOT NULL THEN
    UPDATE budget_categories
    SET actual_amount = actual_amount + NEW.amount_reporting_try
    WHERE fiscal_period_id = NEW.fiscal_period_id
      AND category_name = NEW.category;
  END IF;

  RETURN NEW;
END;
$$;

-- Fix the delete trigger to only track expenses
CREATE OR REPLACE FUNCTION update_budget_actual_on_ledger_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only update budget for EXPENSE entries (not income or transfers)
  IF OLD.entry_type = 'expense' 
     AND OLD.fiscal_period_id IS NOT NULL 
     AND OLD.category IS NOT NULL THEN
    UPDATE budget_categories
    SET actual_amount = actual_amount - OLD.amount_reporting_try
    WHERE fiscal_period_id = OLD.fiscal_period_id
      AND category_name = OLD.category;
  END IF;

  RETURN OLD;
END;
$$;

-- Reset all budget actual_amounts to 0 since they have incorrect data
UPDATE budget_categories
SET actual_amount = 0
WHERE fiscal_period_id IN (
  SELECT id FROM fiscal_periods WHERE status = 'active'
);

-- Recalculate budget actual_amounts from expense entries only
UPDATE budget_categories bc
SET actual_amount = COALESCE((
  SELECT SUM(le.amount_reporting_try)
  FROM ledger_entries le
  WHERE le.fiscal_period_id = bc.fiscal_period_id
    AND le.category = bc.category_name
    AND le.entry_type = 'expense'
), 0);
