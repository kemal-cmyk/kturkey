/*
  # Clean Up Duplicate Ledger Delete Triggers

  ## Overview
  Removes duplicate triggers on ledger_entries table that were created across multiple migrations.
  Only keeps the correct trigger that properly handles the delete operation.

  ## Changes
  
  1. Drop old/conflicting triggers:
    - `trigger_reverse_payment_on_ledger_delete` (from migration 014)
    - Keep only `trigger_reverse_dues_on_ledger_delete` (from migration 016)
  
  2. Drop old/conflicting functions:
    - `reverse_payment_from_ledger()` (from migration 014)
    - Keep only `reverse_dues_from_ledger()` (from migration 016)

  ## Notes
  - Multiple migrations created overlapping triggers with different names
  - Having multiple delete triggers can cause conflicts and unexpected behavior
  - This consolidates to a single, well-defined delete trigger
*/

-- Drop the old trigger from migration 014
DROP TRIGGER IF EXISTS trigger_reverse_payment_on_ledger_delete ON ledger_entries;

-- Drop the old function from migration 014
DROP FUNCTION IF EXISTS reverse_payment_from_ledger();

-- Ensure the correct trigger exists (from migration 016)
-- This trigger properly handles ledger deletions without circular dependencies
DROP TRIGGER IF EXISTS trigger_reverse_dues_on_ledger_delete ON ledger_entries;

CREATE TRIGGER trigger_reverse_dues_on_ledger_delete
  BEFORE DELETE ON ledger_entries
  FOR EACH ROW 
  EXECUTE FUNCTION reverse_dues_from_ledger();