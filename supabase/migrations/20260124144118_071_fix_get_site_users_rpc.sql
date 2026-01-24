/*
  # Fix get_site_users RPC function
  
  1. Changes
    - Remove reference to non-existent unit_assignments table
    - Use units.owner_id instead to link users to units
*/

DROP FUNCTION IF EXISTS get_site_users(uuid);

CREATE OR REPLACE FUNCTION get_site_users(p_site_id uuid)
RETURNS TABLE (
  user_id uuid,
  email text,
  full_name text,
  role text,
  is_active boolean,
  units json
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    usr.user_id,
    au.email,
    p.full_name,
    usr.role,
    usr.is_active,
    COALESCE(
      json_agg(
        json_build_object('id', u.id, 'unit_number', u.unit_number)
      ) FILTER (WHERE u.id IS NOT NULL),
      '[]'::json
    ) as units
  FROM user_site_roles usr
  LEFT JOIN auth.users au ON au.id = usr.user_id
  LEFT JOIN profiles p ON p.id = usr.user_id
  LEFT JOIN units u ON u.owner_id = usr.user_id AND u.site_id = p_site_id
  WHERE usr.site_id = p_site_id
  GROUP BY usr.user_id, au.email, p.full_name, usr.role, usr.is_active
  ORDER BY au.email;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;