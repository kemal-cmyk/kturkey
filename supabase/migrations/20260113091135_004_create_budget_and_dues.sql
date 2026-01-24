/*
  # KTurkey Database Schema - Part 4: Budget & Dues Management
  
  ## Overview
  Creates budget categories and monthly dues generation system.
  
  ## New Tables
  
  ### 1. `budget_categories`
  Budget line items for each fiscal period:
  - `id` (uuid, PK)
  - `fiscal_period_id` (uuid, FK) - References fiscal_periods
  - `category_name` (text) - Expense category (e.g., "Cleaning", "Security")
  - `planned_amount` (numeric) - Budgeted amount
  - `actual_amount` (numeric) - Actual spent (updated as expenses recorded)
  - `display_order` (int) - For UI ordering
  
  ### 2. `dues`
  Monthly dues generated for each unit based on budget:
  - `id` (uuid, PK)
  - `unit_id` (uuid, FK) - References units
  - `fiscal_period_id` (uuid, FK) - References fiscal_periods
  - `month_date` (date) - Month this due applies to
  - `base_amount` (numeric) - Original calculated amount
  - `penalty_amount` (numeric) - Late payment penalty added
  - `total_amount` (numeric) - base + penalty
  - `paid_amount` (numeric) - Amount paid so far
  - `due_date` (date) - Payment deadline
  - `status` (text) - 'pending' | 'paid' | 'partial' | 'overdue'
  - `is_from_previous_period` (boolean) - True if rollover debt
  
  ## Business Logic
  - Dues are auto-generated when fiscal period is activated
  - Amount calculated based on unit coefficient or share ratio
  - Penalty added automatically when overdue > 3 months
*/

-- Create budget_categories table
CREATE TABLE IF NOT EXISTS budget_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_period_id uuid NOT NULL REFERENCES fiscal_periods(id) ON DELETE CASCADE,
  category_name text NOT NULL,
  planned_amount numeric(15,2) DEFAULT 0 CHECK (planned_amount >= 0),
  actual_amount numeric(15,2) DEFAULT 0 CHECK (actual_amount >= 0),
  display_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(fiscal_period_id, category_name)
);

ALTER TABLE budget_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view budget categories of their sites"
  ON budget_categories FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM fiscal_periods fp
      JOIN user_site_roles usr ON usr.site_id = fp.site_id
      WHERE fp.id = budget_categories.fiscal_period_id
      AND usr.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can insert budget categories"
  ON budget_categories FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM fiscal_periods fp
      JOIN user_site_roles usr ON usr.site_id = fp.site_id
      WHERE fp.id = budget_categories.fiscal_period_id
      AND usr.user_id = auth.uid()
      AND usr.role = 'admin'
    )
  );

CREATE POLICY "Admins can update budget categories"
  ON budget_categories FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM fiscal_periods fp
      JOIN user_site_roles usr ON usr.site_id = fp.site_id
      WHERE fp.id = budget_categories.fiscal_period_id
      AND usr.user_id = auth.uid()
      AND usr.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM fiscal_periods fp
      JOIN user_site_roles usr ON usr.site_id = fp.site_id
      WHERE fp.id = budget_categories.fiscal_period_id
      AND usr.user_id = auth.uid()
      AND usr.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete budget categories"
  ON budget_categories FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM fiscal_periods fp
      JOIN user_site_roles usr ON usr.site_id = fp.site_id
      WHERE fp.id = budget_categories.fiscal_period_id
      AND usr.user_id = auth.uid()
      AND usr.role = 'admin'
    )
  );

-- Create dues table
CREATE TABLE IF NOT EXISTS dues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  fiscal_period_id uuid NOT NULL REFERENCES fiscal_periods(id) ON DELETE CASCADE,
  month_date date NOT NULL,
  base_amount numeric(15,2) NOT NULL CHECK (base_amount >= 0),
  penalty_amount numeric(15,2) DEFAULT 0 CHECK (penalty_amount >= 0),
  total_amount numeric(15,2) GENERATED ALWAYS AS (base_amount + penalty_amount) STORED,
  paid_amount numeric(15,2) DEFAULT 0 CHECK (paid_amount >= 0),
  due_date date NOT NULL,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'partial', 'overdue')),
  is_from_previous_period boolean DEFAULT false,
  previous_period_id uuid REFERENCES fiscal_periods(id),
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(unit_id, fiscal_period_id, month_date)
);

ALTER TABLE dues ENABLE ROW LEVEL SECURITY;

-- Admins and board members can view all dues
CREATE POLICY "Admins and board can view all dues"
  ON dues FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM units u
      JOIN user_site_roles usr ON usr.site_id = u.site_id
      WHERE u.id = dues.unit_id
      AND usr.user_id = auth.uid()
      AND usr.role IN ('admin', 'board_member')
    )
  );

-- Homeowners can view their own dues
CREATE POLICY "Homeowners can view own dues"
  ON dues FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM units u
      WHERE u.id = dues.unit_id
      AND u.owner_id = auth.uid()
    )
  );

CREATE POLICY "Admins can insert dues"
  ON dues FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM units u
      JOIN user_site_roles usr ON usr.site_id = u.site_id
      WHERE u.id = dues.unit_id
      AND usr.user_id = auth.uid()
      AND usr.role = 'admin'
    )
  );

CREATE POLICY "Admins can update dues"
  ON dues FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM units u
      JOIN user_site_roles usr ON usr.site_id = u.site_id
      WHERE u.id = dues.unit_id
      AND usr.user_id = auth.uid()
      AND usr.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM units u
      JOIN user_site_roles usr ON usr.site_id = u.site_id
      WHERE u.id = dues.unit_id
      AND usr.user_id = auth.uid()
      AND usr.role = 'admin'
    )
  );

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_budget_categories_period ON budget_categories(fiscal_period_id);
CREATE INDEX IF NOT EXISTS idx_dues_unit ON dues(unit_id);
CREATE INDEX IF NOT EXISTS idx_dues_period ON dues(fiscal_period_id);
CREATE INDEX IF NOT EXISTS idx_dues_status ON dues(status);
CREATE INDEX IF NOT EXISTS idx_dues_month ON dues(month_date);
