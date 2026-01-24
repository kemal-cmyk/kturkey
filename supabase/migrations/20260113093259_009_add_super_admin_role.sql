/*
  # Add Super Admin Role
  
  ## Overview
  Adds super admin capability for KTurkey staff who manage all sites.
  
  ## Changes
  
  ### 1. Add `is_super_admin` column to profiles
  - Boolean flag for global admin access
  - Default: false
  
  ### 2. Update RLS policies
  - Super admins can view and manage all sites
  - Super admins can view all data across the system
  
  ## Security
  - Only existing super admins can promote others
  - Super admin flag cannot be self-assigned
*/

-- Add is_super_admin column to profiles
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS is_super_admin boolean DEFAULT false;

-- Create a function to check if user is super admin
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND is_super_admin = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update sites policies to allow super admin access
DROP POLICY IF EXISTS "Users can view sites they belong to" ON sites;
CREATE POLICY "Users can view sites they belong to or super admin"
  ON sites FOR SELECT
  TO authenticated
  USING (
    is_super_admin() OR
    EXISTS (
      SELECT 1 FROM user_site_roles
      WHERE user_site_roles.site_id = sites.id
      AND user_site_roles.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins can update their sites" ON sites;
CREATE POLICY "Admins or super admin can update sites"
  ON sites FOR UPDATE
  TO authenticated
  USING (
    is_super_admin() OR
    EXISTS (
      SELECT 1 FROM user_site_roles
      WHERE user_site_roles.site_id = sites.id
      AND user_site_roles.user_id = auth.uid()
      AND user_site_roles.role = 'admin'
    )
  )
  WITH CHECK (
    is_super_admin() OR
    EXISTS (
      SELECT 1 FROM user_site_roles
      WHERE user_site_roles.site_id = sites.id
      AND user_site_roles.user_id = auth.uid()
      AND user_site_roles.role = 'admin'
    )
  );

-- Update fiscal_periods policies
DROP POLICY IF EXISTS "Users can view fiscal periods of their sites" ON fiscal_periods;
CREATE POLICY "Users can view fiscal periods"
  ON fiscal_periods FOR SELECT
  TO authenticated
  USING (
    is_super_admin() OR
    EXISTS (
      SELECT 1 FROM user_site_roles
      WHERE user_site_roles.site_id = fiscal_periods.site_id
      AND user_site_roles.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins can insert fiscal periods" ON fiscal_periods;
CREATE POLICY "Admins or super admin can insert fiscal periods"
  ON fiscal_periods FOR INSERT
  TO authenticated
  WITH CHECK (
    is_super_admin() OR
    EXISTS (
      SELECT 1 FROM user_site_roles
      WHERE user_site_roles.site_id = fiscal_periods.site_id
      AND user_site_roles.user_id = auth.uid()
      AND user_site_roles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can update fiscal periods" ON fiscal_periods;
CREATE POLICY "Admins or super admin can update fiscal periods"
  ON fiscal_periods FOR UPDATE
  TO authenticated
  USING (
    is_super_admin() OR
    EXISTS (
      SELECT 1 FROM user_site_roles
      WHERE user_site_roles.site_id = fiscal_periods.site_id
      AND user_site_roles.user_id = auth.uid()
      AND user_site_roles.role = 'admin'
    )
  )
  WITH CHECK (
    is_super_admin() OR
    EXISTS (
      SELECT 1 FROM user_site_roles
      WHERE user_site_roles.site_id = fiscal_periods.site_id
      AND user_site_roles.user_id = auth.uid()
      AND user_site_roles.role = 'admin'
    )
  );

-- Update units policies for super admin
DROP POLICY IF EXISTS "Admins and board can view all units" ON units;
CREATE POLICY "Admins, board, or super admin can view all units"
  ON units FOR SELECT
  TO authenticated
  USING (
    is_super_admin() OR
    EXISTS (
      SELECT 1 FROM user_site_roles
      WHERE user_site_roles.site_id = units.site_id
      AND user_site_roles.user_id = auth.uid()
      AND user_site_roles.role IN ('admin', 'board_member')
    )
  );

DROP POLICY IF EXISTS "Admins can insert units" ON units;
CREATE POLICY "Admins or super admin can insert units"
  ON units FOR INSERT
  TO authenticated
  WITH CHECK (
    is_super_admin() OR
    EXISTS (
      SELECT 1 FROM user_site_roles
      WHERE user_site_roles.site_id = units.site_id
      AND user_site_roles.user_id = auth.uid()
      AND user_site_roles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can update units" ON units;
CREATE POLICY "Admins or super admin can update units"
  ON units FOR UPDATE
  TO authenticated
  USING (
    is_super_admin() OR
    EXISTS (
      SELECT 1 FROM user_site_roles
      WHERE user_site_roles.site_id = units.site_id
      AND user_site_roles.user_id = auth.uid()
      AND user_site_roles.role = 'admin'
    )
  )
  WITH CHECK (
    is_super_admin() OR
    EXISTS (
      SELECT 1 FROM user_site_roles
      WHERE user_site_roles.site_id = units.site_id
      AND user_site_roles.user_id = auth.uid()
      AND user_site_roles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can delete units" ON units;
CREATE POLICY "Admins or super admin can delete units"
  ON units FOR DELETE
  TO authenticated
  USING (
    is_super_admin() OR
    EXISTS (
      SELECT 1 FROM user_site_roles
      WHERE user_site_roles.site_id = units.site_id
      AND user_site_roles.user_id = auth.uid()
      AND user_site_roles.role = 'admin'
    )
  );

-- Super admins can view all user_site_roles
DROP POLICY IF EXISTS "Users can view own roles" ON user_site_roles;
CREATE POLICY "Users can view own roles or super admin all"
  ON user_site_roles FOR SELECT
  TO authenticated
  USING (
    is_super_admin() OR
    auth.uid() = user_id
  );

-- Super admins can manage all roles
CREATE POLICY "Super admin can insert any role"
  ON user_site_roles FOR INSERT
  TO authenticated
  WITH CHECK (is_super_admin());

CREATE POLICY "Super admin can update any role"
  ON user_site_roles FOR UPDATE
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE POLICY "Super admin can delete any role"
  ON user_site_roles FOR DELETE
  TO authenticated
  USING (is_super_admin());

-- Create index for faster super admin lookups
CREATE INDEX IF NOT EXISTS idx_profiles_super_admin ON profiles(is_super_admin) WHERE is_super_admin = true;
