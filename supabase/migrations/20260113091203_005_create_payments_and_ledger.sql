/*
  # KTurkey Database Schema - Part 5: Payments & Ledger Entries
  
  ## Overview
  Creates financial transaction tracking for payments and site expenses.
  
  ## New Tables
  
  ### 1. `payments`
  Records all payments made by homeowners:
  - `id` (uuid, PK)
  - `unit_id` (uuid, FK) - Unit making payment
  - `amount` (numeric) - Payment amount
  - `payment_date` (date) - When payment was made
  - `payment_method` (text) - 'cash' | 'bank_transfer' | 'credit_card' | 'other'
  - `reference_no` (text) - Bank reference or receipt number
  - `applied_to_dues` (jsonb) - Array of due IDs this payment covers
  - `created_by` (uuid) - Admin who recorded the payment
  
  ### 2. `ledger_entries`
  General ledger for all site income/expenses:
  - `id` (uuid, PK)
  - `site_id` (uuid, FK) - Site reference
  - `fiscal_period_id` (uuid, FK) - Period reference
  - `entry_type` (text) - 'income' | 'expense'
  - `category` (text) - Category name (links to budget_categories)
  - `description` (text) - Transaction description
  - `amount` (numeric) - Transaction amount
  - `entry_date` (date) - Transaction date
  - `vendor_name` (text) - For expenses, vendor name
  - `receipt_url` (text) - Uploaded receipt image
  - `created_by` (uuid) - Admin who created entry
  
  ## Security
  - Payments: Admins can create/view, homeowners see own payments
  - Ledger: Admins full access, board read-only, homeowners see aggregates
*/

-- Create payments table
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  amount numeric(15,2) NOT NULL CHECK (amount > 0),
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  payment_method text DEFAULT 'bank_transfer' CHECK (payment_method IN ('cash', 'bank_transfer', 'credit_card', 'other')),
  reference_no text,
  applied_to_dues jsonb DEFAULT '[]'::jsonb,
  notes text,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Admins and board can view all payments
CREATE POLICY "Admins and board can view all payments"
  ON payments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM units u
      JOIN user_site_roles usr ON usr.site_id = u.site_id
      WHERE u.id = payments.unit_id
      AND usr.user_id = auth.uid()
      AND usr.role IN ('admin', 'board_member')
    )
  );

-- Homeowners can view their own payments
CREATE POLICY "Homeowners can view own payments"
  ON payments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM units u
      WHERE u.id = payments.unit_id
      AND u.owner_id = auth.uid()
    )
  );

CREATE POLICY "Admins can insert payments"
  ON payments FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM units u
      JOIN user_site_roles usr ON usr.site_id = u.site_id
      WHERE u.id = payments.unit_id
      AND usr.user_id = auth.uid()
      AND usr.role = 'admin'
    )
  );

CREATE POLICY "Admins can update payments"
  ON payments FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM units u
      JOIN user_site_roles usr ON usr.site_id = u.site_id
      WHERE u.id = payments.unit_id
      AND usr.user_id = auth.uid()
      AND usr.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM units u
      JOIN user_site_roles usr ON usr.site_id = u.site_id
      WHERE u.id = payments.unit_id
      AND usr.user_id = auth.uid()
      AND usr.role = 'admin'
    )
  );

-- Create ledger_entries table
CREATE TABLE IF NOT EXISTS ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  fiscal_period_id uuid REFERENCES fiscal_periods(id) ON DELETE SET NULL,
  entry_type text NOT NULL CHECK (entry_type IN ('income', 'expense')),
  category text NOT NULL,
  description text,
  amount numeric(15,2) NOT NULL CHECK (amount > 0),
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  vendor_name text,
  receipt_url text,
  is_recurring boolean DEFAULT false,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;

-- Admins and board can view all ledger entries
CREATE POLICY "Admins and board can view ledger entries"
  ON ledger_entries FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_site_roles usr
      WHERE usr.site_id = ledger_entries.site_id
      AND usr.user_id = auth.uid()
      AND usr.role IN ('admin', 'board_member')
    )
  );

-- Homeowners can view ledger entries (for transparency report)
CREATE POLICY "Homeowners can view ledger entries"
  ON ledger_entries FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_site_roles usr
      WHERE usr.site_id = ledger_entries.site_id
      AND usr.user_id = auth.uid()
      AND usr.role = 'homeowner'
    )
  );

CREATE POLICY "Admins can insert ledger entries"
  ON ledger_entries FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_site_roles usr
      WHERE usr.site_id = ledger_entries.site_id
      AND usr.user_id = auth.uid()
      AND usr.role = 'admin'
    )
  );

CREATE POLICY "Admins can update ledger entries"
  ON ledger_entries FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_site_roles usr
      WHERE usr.site_id = ledger_entries.site_id
      AND usr.user_id = auth.uid()
      AND usr.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_site_roles usr
      WHERE usr.site_id = ledger_entries.site_id
      AND usr.user_id = auth.uid()
      AND usr.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete ledger entries"
  ON ledger_entries FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_site_roles usr
      WHERE usr.site_id = ledger_entries.site_id
      AND usr.user_id = auth.uid()
      AND usr.role = 'admin'
    )
  );

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_payments_unit ON payments(unit_id);
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_ledger_site ON ledger_entries(site_id);
CREATE INDEX IF NOT EXISTS idx_ledger_period ON ledger_entries(fiscal_period_id);
CREATE INDEX IF NOT EXISTS idx_ledger_type ON ledger_entries(entry_type);
CREATE INDEX IF NOT EXISTS idx_ledger_date ON ledger_entries(entry_date);

-- Trigger to update budget_categories actual_amount when expense is recorded
CREATE OR REPLACE FUNCTION update_budget_actual_amount()
RETURNS trigger AS $$
BEGIN
  IF NEW.entry_type = 'expense' AND NEW.fiscal_period_id IS NOT NULL THEN
    UPDATE budget_categories
    SET actual_amount = actual_amount + NEW.amount
    WHERE fiscal_period_id = NEW.fiscal_period_id
    AND category_name = NEW.category;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_update_budget_actual ON ledger_entries;
CREATE TRIGGER trigger_update_budget_actual
  AFTER INSERT ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION update_budget_actual_amount();
