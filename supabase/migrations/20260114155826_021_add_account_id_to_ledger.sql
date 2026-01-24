/*
  # Add Account ID to Ledger Entries

  ## Overview
  Adds the account_id column to ledger_entries table to track which account
  each transaction belongs to (bank account or cash account).

  ## Changes
  
  1. New Column: `account_id`
    - Links ledger entries to their account
    - References the accounts table
    - Used by frontend to display account information for each entry
    - Optional field (can be NULL for legacy entries)

  ## Notes
  - The frontend code expects this column but it was never created
  - This completes the ledger entry schema for proper account tracking
*/

-- Add account_id column to ledger_entries if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ledger_entries' AND column_name = 'account_id'
  ) THEN
    ALTER TABLE ledger_entries ADD COLUMN account_id uuid REFERENCES accounts(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_ledger_account ON ledger_entries(account_id);
  END IF;
END $$;