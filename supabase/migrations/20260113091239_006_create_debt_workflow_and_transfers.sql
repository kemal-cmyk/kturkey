/*
  # KTurkey Database Schema - Part 6: Debt Workflow & Balance Transfers
  
  ## Overview
  Creates the debt tracking state machine and year-end rollover system.
  This is the CRITICAL component for legal compliance tracking.
  
  ## New Tables
  
  ### 1. `penalty_settings`
  Configurable late payment penalty rates per site:
  - `id` (uuid, PK)
  - `site_id` (uuid, FK) - References sites
  - `months_overdue_threshold` (int) - Months before penalty applies (default: 3)
  - `penalty_percentage` (numeric) - Monthly penalty rate (e.g., 5.00 = 5%)
  - `is_compound` (boolean) - Whether penalty compounds monthly
  
  ### 2. `debt_workflows`
  State machine for debt collection process:
  - `id` (uuid, PK)
  - `unit_id` (uuid, FK) - Unit in debt
  - `fiscal_period_id` (uuid, FK) - Period when debt originated
  - `stage` (int) - Current stage (1-4)
    - Stage 1: Standard notification (0-3 months)
    - Stage 2: Warning message (3+ months)
    - Stage 3: Warning letter generated
    - Stage 4: Legal action (Icra)
  - `total_debt_amount` (numeric) - Total outstanding debt
  - `oldest_unpaid_date` (date) - Date of oldest unpaid due
  - `stage_changed_at` (timestamptz) - When current stage was entered
  - `warning_sent_at` (timestamptz) - Stage 2 notification sent
  - `letter_generated_at` (timestamptz) - Stage 3 letter generated
  - `legal_action_at` (timestamptz) - Stage 4 legal action initiated
  - `legal_case_number` (text) - External legal case reference
  - `is_active` (boolean) - False if debt resolved
  
  ### 3. `balance_transfers`
  Records year-end rollover transactions:
  - `id` (uuid, PK)
  - `unit_id` (uuid, FK) - Unit being transferred
  - `from_fiscal_period_id` (uuid, FK) - Closing period
  - `to_fiscal_period_id` (uuid, FK) - New period
  - `transfer_type` (text) - 'debt' | 'credit' | 'legal_flag'
  - `amount` (numeric) - Transfer amount (null for legal_flag)
  - `legal_stage` (int) - For legal_flag, the stage being carried over
  - `description` (text) - Transfer description
  
  ## Key Business Rules
  1. Debt workflow stages persist across fiscal years
  2. Balance transfers create "Previous Period Balance" entry in new period
  3. Legal action flag MUST carry over when fiscal year closes
  4. Penalty calculation is automated based on penalty_settings
*/

-- Create penalty_settings table
CREATE TABLE IF NOT EXISTS penalty_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  months_overdue_threshold integer DEFAULT 3 CHECK (months_overdue_threshold > 0),
  penalty_percentage numeric(5,2) DEFAULT 5.00 CHECK (penalty_percentage >= 0),
  is_compound boolean DEFAULT false,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(site_id)
);

ALTER TABLE penalty_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view penalty settings of their sites"
  ON penalty_settings FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_site_roles usr
      WHERE usr.site_id = penalty_settings.site_id
      AND usr.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage penalty settings"
  ON penalty_settings FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_site_roles usr
      WHERE usr.site_id = penalty_settings.site_id
      AND usr.user_id = auth.uid()
      AND usr.role = 'admin'
    )
  );

CREATE POLICY "Admins can update penalty settings"
  ON penalty_settings FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_site_roles usr
      WHERE usr.site_id = penalty_settings.site_id
      AND usr.user_id = auth.uid()
      AND usr.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_site_roles usr
      WHERE usr.site_id = penalty_settings.site_id
      AND usr.user_id = auth.uid()
      AND usr.role = 'admin'
    )
  );

-- Create debt_workflows table (State Machine)
CREATE TABLE IF NOT EXISTS debt_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  fiscal_period_id uuid REFERENCES fiscal_periods(id) ON DELETE SET NULL,
  stage integer DEFAULT 1 CHECK (stage BETWEEN 1 AND 4),
  total_debt_amount numeric(15,2) DEFAULT 0,
  oldest_unpaid_date date,
  months_overdue integer DEFAULT 0,
  stage_changed_at timestamptz DEFAULT now(),
  warning_sent_at timestamptz,
  letter_generated_at timestamptz,
  legal_action_at timestamptz,
  legal_case_number text,
  is_active boolean DEFAULT true,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE debt_workflows ENABLE ROW LEVEL SECURITY;

-- Admins and board can view all debt workflows
CREATE POLICY "Admins and board can view debt workflows"
  ON debt_workflows FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM units u
      JOIN user_site_roles usr ON usr.site_id = u.site_id
      WHERE u.id = debt_workflows.unit_id
      AND usr.user_id = auth.uid()
      AND usr.role IN ('admin', 'board_member')
    )
  );

-- Homeowners can view their own debt workflow
CREATE POLICY "Homeowners can view own debt workflow"
  ON debt_workflows FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM units u
      WHERE u.id = debt_workflows.unit_id
      AND u.owner_id = auth.uid()
    )
  );

CREATE POLICY "Admins can insert debt workflows"
  ON debt_workflows FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM units u
      JOIN user_site_roles usr ON usr.site_id = u.site_id
      WHERE u.id = debt_workflows.unit_id
      AND usr.user_id = auth.uid()
      AND usr.role = 'admin'
    )
  );

CREATE POLICY "Admins can update debt workflows"
  ON debt_workflows FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM units u
      JOIN user_site_roles usr ON usr.site_id = u.site_id
      WHERE u.id = debt_workflows.unit_id
      AND usr.user_id = auth.uid()
      AND usr.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM units u
      JOIN user_site_roles usr ON usr.site_id = u.site_id
      WHERE u.id = debt_workflows.unit_id
      AND usr.user_id = auth.uid()
      AND usr.role = 'admin'
    )
  );

-- Create balance_transfers table (Year-End Rollover)
CREATE TABLE IF NOT EXISTS balance_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  from_fiscal_period_id uuid NOT NULL REFERENCES fiscal_periods(id) ON DELETE CASCADE,
  to_fiscal_period_id uuid NOT NULL REFERENCES fiscal_periods(id) ON DELETE CASCADE,
  transfer_type text NOT NULL CHECK (transfer_type IN ('debt', 'credit', 'legal_flag')),
  amount numeric(15,2),
  legal_stage integer CHECK (legal_stage BETWEEN 1 AND 4),
  description text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE balance_transfers ENABLE ROW LEVEL SECURITY;

-- Admins and board can view balance transfers
CREATE POLICY "Admins and board can view balance transfers"
  ON balance_transfers FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM units u
      JOIN user_site_roles usr ON usr.site_id = u.site_id
      WHERE u.id = balance_transfers.unit_id
      AND usr.user_id = auth.uid()
      AND usr.role IN ('admin', 'board_member')
    )
  );

-- Homeowners can view their own balance transfers
CREATE POLICY "Homeowners can view own balance transfers"
  ON balance_transfers FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM units u
      WHERE u.id = balance_transfers.unit_id
      AND u.owner_id = auth.uid()
    )
  );

CREATE POLICY "Admins can insert balance transfers"
  ON balance_transfers FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM units u
      JOIN user_site_roles usr ON usr.site_id = u.site_id
      WHERE u.id = balance_transfers.unit_id
      AND usr.user_id = auth.uid()
      AND usr.role = 'admin'
    )
  );

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_penalty_settings_site ON penalty_settings(site_id);
CREATE INDEX IF NOT EXISTS idx_debt_workflows_unit ON debt_workflows(unit_id);
CREATE INDEX IF NOT EXISTS idx_debt_workflows_stage ON debt_workflows(stage);
CREATE INDEX IF NOT EXISTS idx_debt_workflows_active ON debt_workflows(is_active);
CREATE INDEX IF NOT EXISTS idx_balance_transfers_unit ON balance_transfers(unit_id);
CREATE INDEX IF NOT EXISTS idx_balance_transfers_from ON balance_transfers(from_fiscal_period_id);
CREATE INDEX IF NOT EXISTS idx_balance_transfers_to ON balance_transfers(to_fiscal_period_id);
