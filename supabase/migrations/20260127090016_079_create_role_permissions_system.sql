/*
  # Create Role Permissions System (ACL)

  1. New Tables
    - `role_permissions`
      - `id` (uuid, primary key)
      - `role` (text) - User role (admin, manager, staff, resident)
      - `page_path` (text) - Application page path
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `role_permissions` table
    - All authenticated users can read permissions
    - Only admins and super admins can insert, update, or delete permissions

  3. User Site Roles Table Updates
    - Drop existing restrictive update policy
    - Create new policy allowing admins to update any user's role

  4. Initial Data
    - Seed permissions for admin, manager, staff, and resident roles
    - Admin: Full access to all pages
    - Manager: Operational access (units, residents, budget, reports, ledger, etc.)
    - Staff: Limited operational access (units, residents, tickets)
    - Resident: Basic access (dashboard, tickets, my account)
*/

-- Create role_permissions table
CREATE TABLE IF NOT EXISTS role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL,
  page_path text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(role, page_path)
);

-- Enable RLS
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

-- Policy: All authenticated users can read permissions
CREATE POLICY "Anyone can read role permissions"
  ON role_permissions
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Only admins and super admins can insert permissions
CREATE POLICY "Admins can insert role permissions"
  ON role_permissions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_site_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role = 'admin'
      AND ur.is_active = true
    )
    OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

-- Policy: Only admins and super admins can update permissions
CREATE POLICY "Admins can update role permissions"
  ON role_permissions
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_site_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role = 'admin'
      AND ur.is_active = true
    )
    OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_site_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role = 'admin'
      AND ur.is_active = true
    )
    OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

-- Policy: Only admins and super admins can delete permissions
CREATE POLICY "Admins can delete role permissions"
  ON role_permissions
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_site_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role = 'admin'
      AND ur.is_active = true
    )
    OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_role_permissions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER role_permissions_updated_at
  BEFORE UPDATE ON role_permissions
  FOR EACH ROW
  EXECUTE FUNCTION update_role_permissions_updated_at();

-- Update user_site_roles RLS to allow admins to update any user's role
-- First, drop the existing restrictive update policy if it exists
DROP POLICY IF EXISTS "Users can update roles in their site" ON user_site_roles;
DROP POLICY IF EXISTS "Site managers can update user roles" ON user_site_roles;
DROP POLICY IF EXISTS "Site admins can update user roles" ON user_site_roles;

-- Create new policy allowing admins and super admins to update any user's role
CREATE POLICY "Admins can update any user role"
  ON user_site_roles
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_site_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.site_id = user_site_roles.site_id
      AND ur.role = 'admin'
      AND ur.is_active = true
    )
    OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_site_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.site_id = user_site_roles.site_id
      AND ur.role = 'admin'
      AND ur.is_active = true
    )
    OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

-- Seed initial role permissions
-- Admin: Full access to all pages
INSERT INTO role_permissions (role, page_path) VALUES
  ('admin', '/dashboard'),
  ('admin', '/units'),
  ('admin', '/residents'),
  ('admin', '/budget'),
  ('admin', '/fiscal-periods'),
  ('admin', '/budget-vs-actual'),
  ('admin', '/monthly-income-expenses'),
  ('admin', '/reports'),
  ('admin', '/ledger'),
  ('admin', '/import-ledger'),
  ('admin', '/debt-tracking'),
  ('admin', '/tickets'),
  ('admin', '/users'),
  ('admin', '/settings'),
  ('admin', '/language-settings'),
  ('admin', '/role-settings'),
  ('admin', '/my-account')
ON CONFLICT (role, page_path) DO NOTHING;

-- Board Member (Manager): Operational access
INSERT INTO role_permissions (role, page_path) VALUES
  ('board_member', '/dashboard'),
  ('board_member', '/units'),
  ('board_member', '/residents'),
  ('board_member', '/budget'),
  ('board_member', '/fiscal-periods'),
  ('board_member', '/budget-vs-actual'),
  ('board_member', '/monthly-income-expenses'),
  ('board_member', '/reports'),
  ('board_member', '/ledger'),
  ('board_member', '/import-ledger'),
  ('board_member', '/debt-tracking'),
  ('board_member', '/tickets'),
  ('board_member', '/settings'),
  ('board_member', '/language-settings'),
  ('board_member', '/my-account')
ON CONFLICT (role, page_path) DO NOTHING;

-- Homeowner (Resident): Basic access
INSERT INTO role_permissions (role, page_path) VALUES
  ('homeowner', '/dashboard'),
  ('homeowner', '/tickets'),
  ('homeowner', '/language-settings'),
  ('homeowner', '/my-account')
ON CONFLICT (role, page_path) DO NOTHING;
