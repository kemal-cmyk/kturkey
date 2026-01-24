import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface RequestBody {
  action: 'list_users' | 'invite_user' | 'update_user' | 'deactivate_user';
  site_id: string;
  email?: string;
  full_name?: string;
  role?: 'board_member' | 'homeowner';
  unit_ids?: string[];
  user_id?: string;
  deactivated?: boolean;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('[manage-users] Missing Authorization header');
      return new Response(
        JSON.stringify({ error: 'Missing Authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error('[manage-users] Authentication failed:', authError?.message);
      return new Response(
        JSON.stringify({ error: 'Authentication failed: ' + (authError?.message || 'Invalid token') }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('is_super_admin')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile?.is_super_admin) {
      console.error('[manage-users] Access denied for user:', user.email, '- not superadmin');
      return new Response(
        JSON.stringify({ error: 'Not superadmin' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: RequestBody = await req.json();
    console.log('[manage-users] Action:', body.action, '| Caller:', user.email, '| Site:', body.site_id);

    switch (body.action) {
      case 'list_users': {
        const { data: roles, error } = await supabase
          .from('user_site_roles')
          .select(`
            user_id,
            role,
            is_active,
            profiles!inner(email, full_name),
            unit_assignments!left(units!inner(id, unit_number))
          `)
          .eq('site_id', body.site_id);

        if (error) {
          console.error('[manage-users] List users failed:', error.message);
          throw error;
        }

        const users = roles?.map((role: any) => ({
          user_id: role.user_id,
          email: role.profiles.email,
          full_name: role.profiles.full_name,
          role: role.role,
          is_active: role.is_active,
          units: role.unit_assignments?.map((ua: any) => ({
            id: ua.units.id,
            unit_number: ua.units.unit_number,
          })) || [],
        })) || [];

        console.log('[manage-users] Listed', users.length, 'users');
        return new Response(
          JSON.stringify({ users }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'invite_user': {
        if (!body.email || !body.role) {
          console.error('[manage-users] Invite failed: missing email or role');
          return new Response(
            JSON.stringify({ error: 'Email and role are required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data: existingUser, error: lookupError } = await supabase.auth.admin.listUsers();

        if (lookupError) {
          console.error('[manage-users] User lookup failed:', lookupError.message);
          throw lookupError;
        }

        const userExists = existingUser.users.find(u => u.email === body.email);
        let invitedUserId: string;

        if (userExists) {
          invitedUserId = userExists.id;
          console.log('[manage-users] User already exists:', body.email);

          const { data: existingRole } = await supabase
            .from('user_site_roles')
            .select('id')
            .eq('user_id', invitedUserId)
            .eq('site_id', body.site_id)
            .maybeSingle();

          if (existingRole) {
            console.error('[manage-users] User already has role at this site');
            return new Response(
              JSON.stringify({ error: 'User already has access to this site' }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        } else {
          const tempPassword = crypto.randomUUID();
          const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
            email: body.email,
            password: tempPassword,
            email_confirm: true,
            user_metadata: { full_name: body.full_name || '' },
          });

          if (createError || !newUser.user) {
            console.error('[manage-users] User creation failed:', createError?.message);
            throw createError || new Error('Failed to create user');
          }

          invitedUserId = newUser.user.id;
          console.log('[manage-users] Created new user:', body.email);
        }

        const { error: roleError } = await supabase
          .from('user_site_roles')
          .insert({
            user_id: invitedUserId,
            site_id: body.site_id,
            role: body.role,
            is_active: true,
          });

        if (roleError) {
          console.error('[manage-users] Role assignment failed:', roleError.message);
          throw roleError;
        }

        if (body.role === 'homeowner' && body.unit_ids && body.unit_ids.length > 0) {
          const { error: unitError } = await supabase
            .from('unit_assignments')
            .insert(
              body.unit_ids.map(unit_id => ({
                user_id: invitedUserId,
                unit_id,
                site_id: body.site_id,
              }))
            );

          if (unitError) {
            console.error('[manage-users] Unit assignment failed:', unitError.message);
            throw unitError;
          }
        }

        console.log('[manage-users] Successfully invited user:', body.email, '| Role:', body.role);
        return new Response(
          JSON.stringify({ success: true, message: 'User invited successfully' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'update_user': {
        if (!body.user_id) {
          console.error('[manage-users] Update failed: missing user_id');
          return new Response(
            JSON.stringify({ error: 'User ID is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { error: roleError } = await supabase
          .from('user_site_roles')
          .update({ role: body.role })
          .eq('user_id', body.user_id)
          .eq('site_id', body.site_id);

        if (roleError) {
          console.error('[manage-users] Role update failed:', roleError.message);
          throw roleError;
        }

        const { error: deleteError } = await supabase
          .from('unit_assignments')
          .delete()
          .eq('user_id', body.user_id)
          .eq('site_id', body.site_id);

        if (deleteError) {
          console.error('[manage-users] Unit cleanup failed:', deleteError.message);
        }

        if (body.role === 'homeowner' && body.unit_ids && body.unit_ids.length > 0) {
          const { error: unitError } = await supabase
            .from('unit_assignments')
            .insert(
              body.unit_ids.map(unit_id => ({
                user_id: body.user_id,
                unit_id,
                site_id: body.site_id,
              }))
            );

          if (unitError) {
            console.error('[manage-users] Unit assignment failed:', unitError.message);
            throw unitError;
          }
        }

        console.log('[manage-users] Successfully updated user:', body.user_id);
        return new Response(
          JSON.stringify({ success: true, message: 'User updated successfully' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'deactivate_user': {
        if (!body.user_id) {
          console.error('[manage-users] Deactivate failed: missing user_id');
          return new Response(
            JSON.stringify({ error: 'User ID is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { error } = await supabase
          .from('user_site_roles')
          .update({ is_active: !body.deactivated })
          .eq('user_id', body.user_id)
          .eq('site_id', body.site_id);

        if (error) {
          console.error('[manage-users] Status update failed:', error.message);
          throw error;
        }

        console.log('[manage-users] User status updated:', body.user_id, '| Active:', !body.deactivated);
        return new Response(
          JSON.stringify({ success: true, message: 'User status updated successfully' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default: {
        console.error('[manage-users] Invalid action:', body.action);
        return new Response(
          JSON.stringify({ error: 'Invalid action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('[manage-users] Error:', errorMessage, error);
    return new Response(
      JSON.stringify({
        error: 'Operation failed: ' + errorMessage,
        details: error instanceof Error ? error.stack : undefined
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
