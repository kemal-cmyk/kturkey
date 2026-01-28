/*
  # Add Initial Exchange Rate to Accounts

  1. Changes
    - Add `initial_exchange_rate` column to `accounts` table
    - Default value is 1 (no conversion)
    - Used to store the exchange rate at account creation time
  
  2. Notes
    - This allows tracking the original exchange rate for accounts created in foreign currencies
    - Helps maintain accurate historical financial records
*/

-- Add initial_exchange_rate column to accounts table
ALTER TABLE accounts 
ADD COLUMN IF NOT EXISTS initial_exchange_rate NUMERIC DEFAULT 1;

-- Update existing accounts to have initial_exchange_rate = 1
UPDATE accounts 
SET initial_exchange_rate = 1 
WHERE initial_exchange_rate IS NULL;
