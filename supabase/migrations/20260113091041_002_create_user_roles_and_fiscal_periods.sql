/*
  # KTurkey Database Schema - Part 2: User Roles & Fiscal Periods
  
  ## Overview
  Creates role-based access control per site and fiscal period management.
  
  ## New Tables
  
  ### 1. `user_site_roles`
  Maps users to sites with specific roles:
  - `id` (uuid, PK)
  - `user_id` (uuid, FK) - References profiles
  - `site_id` (uuid, FK) - References sites
  - `role` (text) - 'admin' | 'board_member' | 'homeowner'
  - Unique constraint on (user_id, site_id)
  
  ### 2. `fiscal_periods`
  Defines fiscal years per site (flexible start dates):
  - `id` (uuid, PK)
  - `site_id` (uuid, FK) - References sites
  - `name` (text) - Period name (e.g., "2024-2025")
  - `start_date` (date) - Fiscal year start
  - `end_date` (date) - Fiscal year end (12 months later)
  - `total_budget` (numeric) - Approved budget amount
  - `status` (text) - 'draft' | 'active' | 'closed'
  - `closed_at` (timestamptz) - When period was closed
  
  ## Security
  - RLS policies based on user_site_roles membership
  - Admins: Full access to their sites
  - Board Members: Read-only access
  - Homeowners: Limited access (via unit ownership)
*/

-- Create user_site_roles for role-based access per site
CREATE TABLE IF NOT EXISTS user_site_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('admin', 'board_member', 'homeowner')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, site_id)
);

ALTER TABLE user_site_roles ENABLE ROW LEVEL SECURITY;

-- Users can view their own role assignments
CREATE POLICY "Users can view own roles"
  ON user_site_roles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Admins can manage roles for their sites
CREATE POLICY "Admins can insert roles"
  ON user_site_roles FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_site_roles
      WHERE user_site_roles.site_id = user_site_roles.site_id
      AND user_site_roles.user_id = auth.uid()
      AND user_site_roles.role = 'admin'
    )
    OR NOT EXISTS (SELECT 1 FROM user_site_roles WHERE site_id = user_site_roles.site_id)
  );

CREATE POLICY "Admins can update roles"
  ON user_site_roles FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_site_roles usr
      WHERE usr.site_id = user_site_roles.site_id
      AND usr.user_id = auth.uid()
      AND usr.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_site_roles usr
      WHERE usr.site_id = user_site_roles.site_id
      AND usr.user_id = auth.uid()
      AND usr.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete roles"
  ON user_site_roles FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_site_roles usr
      WHERE usr.site_id = user_site_roles.site_id
      AND usr.user_id = auth.uid()
      AND usr.role = 'admin'
    )
  );

-- Now we can add site policies based on roles
CREATE POLICY "Users can view sites they belong to"
  ON sites FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_site_roles
      WHERE user_site_roles.site_id = sites.id
      AND user_site_roles.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can insert sites"
  ON sites FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can update their sites"
  ON sites FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_site_roles
      WHERE user_site_roles.site_id = sites.id
      AND user_site_roles.user_id = auth.uid()
      AND user_site_roles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_site_roles
      WHERE user_site_roles.site_id = sites.id
      AND user_site_roles.user_id = auth.uid()
      AND user_site_roles.role = 'admin'
    )
  );

-- Create fiscal_periods table
CREATE TABLE IF NOT EXISTS fiscal_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  total_budget numeric(15,2) DEFAULT 0,
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'closed')),
  closed_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT valid_date_range CHECK (end_date > start_date)
);

ALTER TABLE fiscal_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view fiscal periods of their sites"
  ON fiscal_periods FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_site_roles
      WHERE user_site_roles.site_id = fiscal_periods.site_id
      AND user_site_roles.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can insert fiscal periods"
  ON fiscal_periods FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_site_roles
      WHERE user_site_roles.site_id = fiscal_periods.site_id
      AND user_site_roles.user_id = auth.uid()
      AND user_site_roles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update fiscal periods"
  ON fiscal_periods FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_site_roles
      WHERE user_site_roles.site_id = fiscal_periods.site_id
      AND user_site_roles.user_id = auth.uid()
      AND user_site_roles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_site_roles
      WHERE user_site_roles.site_id = fiscal_periods.site_id
      AND user_site_roles.user_id = auth.uid()
      AND user_site_roles.role = 'admin'
    )
  );

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_site_roles_user ON user_site_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_site_roles_site ON user_site_roles(site_id);
CREATE INDEX IF NOT EXISTS idx_fiscal_periods_site ON fiscal_periods(site_id);
CREATE INDEX IF NOT EXISTS idx_fiscal_periods_status ON fiscal_periods(status);
