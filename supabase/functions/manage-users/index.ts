import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface RequestBody {
  action: 'list_users' | 'invite_user' | 'update_user' | 'deactivate_user' | 'delete_user';
  site_id: string;
  email?: string;
  full_name?: string;
  role?: 'admin' | 'board_member' | 'homeowner' | 'manager' | 'staff' | 'resident';
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
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Missing Authorization header');

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) throw new Error('Unauthorized');

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Verify Super Admin
    const { data: profile } = await adminClient
      .from('profiles')
      .select('is_super_admin')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile?.is_super_admin) throw new Error('Forbidden: not superadmin');

    const body: RequestBody = await req.json();

    switch (body.action) {
      case 'list_users': {
        const response = await fetch(`${supabaseUrl}/rest/v1/rpc/get_site_users`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation',
          },
          body: JSON.stringify({ p_site_id: body.site_id }),
        });
        
        if (!response.ok) throw new Error('RPC call failed');
        const users = await response.json();
        return new Response(JSON.stringify({ users }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'invite_user': {
        if (!body.email || !body.role) throw new Error('Email and role required');
        
        // 1. Check if user exists
        const { data: authUser } = await adminClient.schema('auth').from('users').select('id,email').eq('email', body.email).maybeSingle();
        let userId = authUser?.id;

        // 2. Invite if new
        if (!userId) {
          const { data: invite, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(body.email, { data: { full_name: body.full_name } });
          if (inviteError) throw inviteError;
          userId = invite.user.id;
        }

        // 3. Assign Role (Upsert to handle re-invites safely)
        const { error: roleError } = await adminClient
          .from('user_site_roles')
          .upsert({ user_id: userId, site_id: body.site_id, role: body.role, is_active: true }, { onConflict: 'user_id,site_id' });
        if (roleError) throw roleError;

        // 4. Assign Units (if Homeowner)
        if (['homeowner', 'resident'].includes(body.role!) && body.unit_ids?.length) {
          // Clear previous owner for these units
          await adminClient.from('units').update({ owner_id: userId }).in('id', body.unit_ids).eq('site_id', body.site_id);
        }

        return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'update_user': {
        if (!body.user_id) throw new Error('User ID required');

        // 1. Update Role
        const { error: roleError } = await adminClient
          .from('user_site_roles')
          .update({ role: body.role })
          .eq('user_id', body.user_id)
          .eq('site_id', body.site_id);
        if (roleError) throw roleError;

        // 2. Handle Units (Clear all first, then set new ones if Homeowner)
        await adminClient.from('units').update({ owner_id: null }).eq('owner_id', body.user_id).eq('site_id', body.site_id);
        
        if (['homeowner', 'resident'].includes(body.role!) && body.unit_ids?.length) {
          await adminClient.from('units').update({ owner_id: body.user_id }).in('id', body.unit_ids).eq('site_id', body.site_id);
        }

        return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'deactivate_user': {
        if (!body.user_id) throw new Error('User ID required');
        // Toggle the is_active status
        const { error } = await adminClient
          .from('user_site_roles')
          .update({ is_active: !body.deactivated })
          .eq('user_id', body.user_id)
          .eq('site_id', body.site_id);
        if (error) throw error;

        return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'delete_user': {
         if (!body.user_id) throw new Error('User ID required');

         // 1. Unassign any units owned by this user
         await adminClient
           .from('units')
           .update({ owner_id: null, owner_name: null, owner_email: null })
           .eq('owner_id', body.user_id)
           .eq('site_id', body.site_id);

         // 2. Remove the role entry (This effectively removes them from the site)
         const { error: deleteError } = await adminClient
           .from('user_site_roles')
           .delete()
           .eq('user_id', body.user_id)
           .eq('site_id', body.site_id);
         
         if (deleteError) throw deleteError;

         // Note: We do NOT delete from auth.users because they might belong to other sites
         return new Response(JSON.stringify({ success: true, message: 'User removed from site' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      default:
        throw new Error('Invalid action');
    }

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});