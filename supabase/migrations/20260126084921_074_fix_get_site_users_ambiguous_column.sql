/*
  # Fix Ambiguous Column Reference in get_site_users

  1. Changes
    - Simplify get_site_users RPC to avoid ambiguous column reference
    - Use CTE (Common Table Expression) for cleaner query structure
*/

DROP FUNCTION IF EXISTS get_site_users(uuid);
CREATE OR REPLACE FUNCTION get_site_users(p_site_id uuid)
RETURNS TABLE (
  user_id uuid,
  email varchar,
  full_name text,
  role text,
  is_active boolean,
  units json
) SECURITY DEFINER AS $$
DECLARE
  has_access boolean;
BEGIN
  -- Check if executing user is a board member/admin for this site or super admin
  SELECT EXISTS (
    SELECT 1 FROM user_site_roles 
    WHERE user_id = auth.uid() 
      AND site_id = p_site_id 
      AND role IN ('admin', 'board_member')
  ) OR EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true
  ) INTO has_access;

  IF NOT has_access THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  WITH user_units AS (
    SELECT 
      u.owner_id,
      json_agg(json_build_object('id', u.id, 'unit_number', u.unit_number)) as unit_list
    FROM units u
    WHERE u.site_id = p_site_id AND u.owner_id IS NOT NULL
    GROUP BY u.owner_id
  )
  SELECT 
    p.id as user_id,
    au.email::varchar,
    p.full_name,
    usr.role,
    usr.is_active,
    COALESCE(uu.unit_list, '[]'::json) as units
  FROM profiles p
  JOIN auth.users au ON au.id = p.id
  JOIN user_site_roles usr ON usr.user_id = p.id AND usr.site_id = p_site_id
  LEFT JOIN user_units uu ON uu.owner_id = p.id;
END;
$$ LANGUAGE plpgsql;
