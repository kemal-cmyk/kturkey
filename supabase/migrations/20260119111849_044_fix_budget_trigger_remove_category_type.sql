/*
  # Fix Budget Trigger - Remove category_type Filter
  
  ## Problem
  The `update_budget_actual_on_ledger_insert()` and `update_budget_actual_on_ledger_delete()` 
  functions are trying to filter by `category_type` column which doesn't exist in the 
  `budget_categories` table. This causes maintenance fee income entries to fail.
  
  ## Solution
  Remove the `category_type` filter from both triggers. Budget categories are matched
  only by `category_name` and `fiscal_period_id`.
  
  ## Changes
  1. Update `update_budget_actual_on_ledger_insert()` to remove category_type filter
  2. Update `update_budget_actual_on_ledger_delete()` to remove category_type filter
*/

-- Fix the insert trigger
CREATE OR REPLACE FUNCTION update_budget_actual_on_ledger_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only update budget for non-transfer entries with fiscal period
  -- Use amount_reporting_try for multi-currency consistency
  IF NEW.entry_type != 'transfer' AND NEW.fiscal_period_id IS NOT NULL AND NEW.category IS NOT NULL THEN
    UPDATE budget_categories
    SET actual_amount = actual_amount + NEW.amount_reporting_try
    WHERE fiscal_period_id = NEW.fiscal_period_id
      AND category_name = NEW.category;
  END IF;

  RETURN NEW;
END;
$$;

-- Fix the delete trigger
CREATE OR REPLACE FUNCTION update_budget_actual_on_ledger_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only update budget for non-transfer entries with fiscal period
  -- Use amount_reporting_try for multi-currency consistency
  IF OLD.entry_type != 'transfer' AND OLD.fiscal_period_id IS NOT NULL AND OLD.category IS NOT NULL THEN
    UPDATE budget_categories
    SET actual_amount = actual_amount - OLD.amount_reporting_try
    WHERE fiscal_period_id = OLD.fiscal_period_id
      AND category_name = OLD.category;
  END IF;

  RETURN OLD;
END;
$$;