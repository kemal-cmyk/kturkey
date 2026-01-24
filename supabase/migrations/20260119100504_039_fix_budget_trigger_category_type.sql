/*
  # Fix Budget Trigger - Remove Non-existent category_type Column
  
  ## Overview
  The triggers for updating budget actual amounts were referencing a non-existent 
  `category_type` column in the budget_categories table. This migration fixes those
  triggers to work correctly without that column.
  
  ## Changes
  1. Update `update_budget_actual_on_ledger_insert()` trigger function
     - Remove the category_type check
     - Match only on category_name
  
  2. Update `update_budget_actual_on_ledger_delete()` trigger function
     - Remove the category_type check
     - Match only on category_name
  
  ## Impact
  - Income and expense ledger entries will now correctly update their corresponding
    budget categories' actual_amount
  - No data loss
*/

-- Fix the insert trigger function
CREATE OR REPLACE FUNCTION update_budget_actual_on_ledger_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only update budget for non-transfer entries with fiscal period
  IF NEW.entry_type != 'transfer' AND NEW.fiscal_period_id IS NOT NULL AND NEW.category IS NOT NULL THEN
    UPDATE budget_categories
    SET actual_amount = actual_amount + NEW.amount
    WHERE fiscal_period_id = NEW.fiscal_period_id
      AND category_name = NEW.category;
  END IF;

  RETURN NEW;
END;
$$;

-- Fix the delete trigger function
CREATE OR REPLACE FUNCTION update_budget_actual_on_ledger_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only update budget for non-transfer entries with fiscal period
  IF OLD.entry_type != 'transfer' AND OLD.fiscal_period_id IS NOT NULL AND OLD.category IS NOT NULL THEN
    UPDATE budget_categories
    SET actual_amount = actual_amount - OLD.amount
    WHERE fiscal_period_id = OLD.fiscal_period_id
      AND category_name = OLD.category;
  END IF;

  RETURN OLD;
END;
$$;