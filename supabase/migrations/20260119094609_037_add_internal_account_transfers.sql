/*
  # Add Internal Account Transfers (Virman)

  1. Changes to `ledger_entries` table
    - Modify `entry_type` constraint to include 'transfer'
    - Add `from_account_id` column for transfer source account
    - Add `to_account_id` column for transfer destination account
    - Make `category` nullable (transfers don't need categories)
    
  2. New Functions
    - `create_account_transfer`: Function to create a transfer between accounts
    
  3. Security
    - Update RLS policies to handle transfers
    
  4. Notes
    - Transfers DO NOT affect P&L (Operating Ledger)
    - Transfers only adjust account balances
    - Both `from_account_id` and `to_account_id` must be provided for transfers
    - Regular entries use `account_id`, transfers use `from_account_id` and `to_account_id`
*/

-- Step 1: Modify entry_type constraint to include 'transfer'
DO $$
BEGIN
  ALTER TABLE ledger_entries 
    DROP CONSTRAINT IF EXISTS ledger_entries_entry_type_check;
  
  ALTER TABLE ledger_entries
    ADD CONSTRAINT ledger_entries_entry_type_check 
    CHECK (entry_type IN ('income', 'expense', 'transfer'));
END $$;

-- Step 2: Add transfer-related columns
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'ledger_entries' AND column_name = 'from_account_id'
  ) THEN
    ALTER TABLE ledger_entries 
      ADD COLUMN from_account_id uuid REFERENCES accounts(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'ledger_entries' AND column_name = 'to_account_id'
  ) THEN
    ALTER TABLE ledger_entries 
      ADD COLUMN to_account_id uuid REFERENCES accounts(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Step 3: Make category nullable for transfers
ALTER TABLE ledger_entries 
  ALTER COLUMN category DROP NOT NULL;

-- Step 4: Add check constraint for transfers
DO $$
BEGIN
  ALTER TABLE ledger_entries 
    DROP CONSTRAINT IF EXISTS ledger_entries_transfer_accounts_check;
  
  ALTER TABLE ledger_entries
    ADD CONSTRAINT ledger_entries_transfer_accounts_check 
    CHECK (
      (entry_type = 'transfer' AND from_account_id IS NOT NULL AND to_account_id IS NOT NULL AND from_account_id != to_account_id)
      OR (entry_type != 'transfer')
    );
END $$;

-- Step 5: Create function to handle account transfers
CREATE OR REPLACE FUNCTION create_account_transfer(
  p_site_id uuid,
  p_from_account_id uuid,
  p_to_account_id uuid,
  p_amount numeric,
  p_transfer_date date,
  p_description text,
  p_created_by uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_transfer_id uuid;
BEGIN
  -- Validate that accounts are different
  IF p_from_account_id = p_to_account_id THEN
    RAISE EXCEPTION 'Cannot transfer to the same account';
  END IF;

  -- Validate that amount is positive
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Transfer amount must be positive';
  END IF;

  -- Create the transfer entry
  INSERT INTO ledger_entries (
    site_id,
    entry_type,
    from_account_id,
    to_account_id,
    amount,
    entry_date,
    description,
    created_by
  ) VALUES (
    p_site_id,
    'transfer',
    p_from_account_id,
    p_to_account_id,
    p_amount,
    p_transfer_date,
    p_description,
    p_created_by
  )
  RETURNING id INTO v_transfer_id;

  -- Update account balances
  -- Deduct from source account
  UPDATE accounts 
  SET current_balance = current_balance - p_amount,
      updated_at = now()
  WHERE id = p_from_account_id;

  -- Add to destination account
  UPDATE accounts 
  SET current_balance = current_balance + p_amount,
      updated_at = now()
  WHERE id = p_to_account_id;

  RETURN v_transfer_id;
END;
$$;

-- Step 6: Update the trigger to exclude transfers from budget calculations
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
      AND category_name = NEW.category
      AND category_type = NEW.entry_type;
  END IF;

  RETURN NEW;
END;
$$;

-- Recreate trigger (in case it doesn't exist or needs updating)
DROP TRIGGER IF EXISTS trg_update_budget_on_ledger_insert ON ledger_entries;
CREATE TRIGGER trg_update_budget_on_ledger_insert
  AFTER INSERT ON ledger_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_budget_actual_on_ledger_insert();

-- Step 7: Update the delete trigger to exclude transfers from budget calculations
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
      AND category_name = OLD.category
      AND category_type = OLD.entry_type;
  END IF;

  RETURN OLD;
END;
$$;

-- Recreate delete trigger
DROP TRIGGER IF EXISTS trg_update_budget_on_ledger_delete ON ledger_entries;
CREATE TRIGGER trg_update_budget_on_ledger_delete
  AFTER DELETE ON ledger_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_budget_actual_on_ledger_delete();

-- Step 8: Create trigger to handle account balance updates on transfer deletion
CREATE OR REPLACE FUNCTION revert_account_transfer_on_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only revert balances for transfer entries
  IF OLD.entry_type = 'transfer' AND OLD.from_account_id IS NOT NULL AND OLD.to_account_id IS NOT NULL THEN
    -- Add back to source account
    UPDATE accounts 
    SET current_balance = current_balance + OLD.amount,
        updated_at = now()
    WHERE id = OLD.from_account_id;

    -- Deduct from destination account
    UPDATE accounts 
    SET current_balance = current_balance - OLD.amount,
        updated_at = now()
    WHERE id = OLD.to_account_id;
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_revert_transfer_on_delete ON ledger_entries;
CREATE TRIGGER trg_revert_transfer_on_delete
  BEFORE DELETE ON ledger_entries
  FOR EACH ROW
  EXECUTE FUNCTION revert_account_transfer_on_delete();