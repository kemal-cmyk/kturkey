/*
  # Make info@kturkey.com a Superadmin
  
  Updates the existing info@kturkey.com profile to have superadmin privileges
*/

UPDATE profiles
SET is_super_admin = true, full_name = 'Info Admin'
WHERE id = '57679209-f4ad-45dc-80fd-ab2cc5488db5';
