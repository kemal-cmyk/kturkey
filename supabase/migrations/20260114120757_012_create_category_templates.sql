/*
  # Create Category Templates

  This migration adds a standard set of income and expense categories
  for building management accounting.

  ## New Tables

  ### `category_templates`
  Master list of standard income and expense categories:
  - `id` (uuid, PK)
  - `name` (text) - Category name
  - `type` (text) - 'income' or 'expense'
  - `display_order` (integer) - Order for display in UI
  - `is_default` (boolean) - Whether this is a default category
  - `created_at` (timestamptz)

  ## Standard Income Categories
  1. Maintenance Fees
  2. Extra Fees
  3. Uncollected Fees from Previous Term
  4. Prepayments from Previous Term
  5. Exchange Rate Incomes
  6. Insurance Refunds
  7. Other Incomes

  ## Standard Expense Categories
  1. Staff Salary
  2. Staff Social Insurance
  3. Chartered Accountant Fee
  4. Official Expenses
  5. Communal Electric Payments
  6. Communal Water Payments
  7. Pool Chemicals
  8. Pool Maintenance
  9. Elevator Control
  10. Elevator Repairs
  11. Elevator TSE Inspection
  12. Elevator Safety Label Cost
  13. Cleaning Expenses
  14. Garden Expenses
  15. Building Maintenance & Repairs
  16. Generator Fuel
  17. Generator Maintenance
  18. Communal Area Insurance
  19. New Fixtures
  20. Management Company Fee
  21. Other Expenses
  22. Communal Internet Fee
  23. Deficit From Last Period

  ## Security
  - All authenticated users can view category templates (read-only reference data)
  - No insert/update/delete policies (system data only)
*/

-- Create category_templates table
CREATE TABLE IF NOT EXISTS category_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  type text NOT NULL CHECK (type IN ('income', 'expense')),
  display_order integer NOT NULL DEFAULT 0,
  is_default boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE category_templates ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view category templates
CREATE POLICY "All users can view category templates"
  ON category_templates FOR SELECT
  TO authenticated
  USING (true);

-- Insert standard income categories
INSERT INTO category_templates (name, type, display_order) VALUES
  ('Maintenance Fees', 'income', 1),
  ('Extra Fees', 'income', 2),
  ('Uncollected Fees from Previous Term', 'income', 3),
  ('Prepayments from Previous Term', 'income', 4),
  ('Exchange Rate Incomes', 'income', 5),
  ('Insurance Refunds', 'income', 6),
  ('Other Incomes', 'income', 7)
ON CONFLICT (name) DO NOTHING;

-- Insert standard expense categories
INSERT INTO category_templates (name, type, display_order) VALUES
  ('Staff Salary', 'expense', 1),
  ('Staff Social Insurance', 'expense', 2),
  ('Chartered Accountant Fee', 'expense', 3),
  ('Official Expenses', 'expense', 4),
  ('Communal Electric Payments', 'expense', 5),
  ('Communal Water Payments', 'expense', 6),
  ('Pool Chemicals', 'expense', 7),
  ('Pool Maintenance', 'expense', 8),
  ('Elevator Control', 'expense', 9),
  ('Elevator Repairs', 'expense', 10),
  ('Elevator TSE Inspection', 'expense', 11),
  ('Elevator Safety Label Cost', 'expense', 12),
  ('Cleaning Expenses', 'expense', 13),
  ('Garden Expenses', 'expense', 14),
  ('Building Maintenance & Repairs', 'expense', 15),
  ('Generator Fuel', 'expense', 16),
  ('Generator Maintenance', 'expense', 17),
  ('Communal Area Insurance', 'expense', 18),
  ('New Fixtures', 'expense', 19),
  ('Management Company Fee', 'expense', 20),
  ('Other Expenses', 'expense', 21),
  ('Communal Internet Fee', 'expense', 22),
  ('Deficit From Last Period', 'expense', 23)
ON CONFLICT (name) DO NOTHING;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_category_templates_type ON category_templates(type);
CREATE INDEX IF NOT EXISTS idx_category_templates_order ON category_templates(type, display_order);