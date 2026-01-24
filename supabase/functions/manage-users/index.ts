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
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('[manage-users] Missing Authorization header');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: authError } = await authClient.auth.getUser();

    if (authError || !user) {
      console.error('[manage-users] Authentication failed:', authError?.message || 'Invalid token');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const { data: profile } = await adminClient
      .from('profiles')
      .select('is_super_admin')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile?.is_super_admin) {
      console.error('[manage-users] Access denied for user:', user.email, '- not superadmin');
      return new Response(
        JSON.stringify({ error: 'Forbidden: not superadmin' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: RequestBody = await req.json();
    console.log('[manage-users] Action:', body.action, '| Caller:', user.email, '| Site:', body.site_id);

    switch (body.action) {
      case 'list_users': {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

        const response = await fetch(`${supabaseUrl}/rest/v1/rpc/get_site_users`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation',
          },
          body: JSON.stringify({ p_site_id: body.site_id }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[manage-users] RPC call failed:', response.status, errorText);

          const { data: roles, error } = await adminClient
            .from('user_site_roles')
            .select(`
              user_id,
              role,
              is_active,
              profiles!inner(full_name)
            `)
            .eq('site_id', body.site_id);

          if (error) {
            console.error('[manage-users] List users failed:', error.message);
            throw error;
          }

          const userIds = roles?.map((r: any) => r.user_id) || [];

          let authUsers: any[] = [];
          if (userIds.length > 0) {
            const { data: users } = await adminClient
              .schema('auth')
              .from('users')
              .select('id,email')
              .in('id', userIds);

            authUsers = users || [];
          }

          const { data: ownedUnits } = await adminClient
            .from('units')
            .select('id, unit_number, owner_id')
            .eq('site_id', body.site_id)
            .in('owner_id', userIds);

          const emailMap = new Map(authUsers.map((u: any) => [u.id, u.email]));
          const unitsMap = new Map<string, any[]>();

          ownedUnits?.forEach((unit: any) => {
            if (!unitsMap.has(unit.owner_id)) {
              unitsMap.set(unit.owner_id, []);
            }
            unitsMap.get(unit.owner_id)?.push({
              id: unit.id,
              unit_number: unit.unit_number,
            });
          });

          const users = roles?.map((role: any) => ({
            user_id: role.user_id,
            email: emailMap.get(role.user_id) || 'unknown',
            full_name: role.profiles.full_name || '',
            role: role.role,
            is_active: role.is_active,
            units: unitsMap.get(role.user_id) || [],
          })) || [];

          console.log('[manage-users] Listed', users.length, 'users');
          return new Response(
            JSON.stringify({ users }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const rpcUsers = await response.json();
        console.log('[manage-users] Listed', rpcUsers.length, 'users via RPC');
        return new Response(
          JSON.stringify({ users: rpcUsers }),
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

        const { data: authUser } = await adminClient
          .schema('auth')
          .from('users')
          .select('id,email')
          .eq('email', body.email)
          .maybeSingle();

        let invitedUserId: string;

        if (authUser) {
          invitedUserId = authUser.id;
          console.log('[manage-users] User already exists:', body.email);

          const { data: existingRole } = await adminClient
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
          try {
            const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
              body.email,
              { data: { full_name: body.full_name || '' } }
            );

            if (inviteError || !inviteData.user) {
              console.log('[manage-users] inviteUserByEmail failed, trying generateLink fallback:', inviteError?.message);

              const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
                type: 'invite',
                email: body.email,
                options: { data: { full_name: body.full_name || '' } }
              });

              if (linkError || !linkData.user) {
                console.error('[manage-users] Both invite and generateLink failed');
                throw linkError || new Error('Failed to create invite');
              }

              invitedUserId = linkData.user.id;
              console.log('[manage-users] Generated invite link for user:', body.email);

              const { error: roleError } = await adminClient
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
                const { data: conflictingUnits } = await adminClient
                  .from('units')
                  .select('id, unit_number, owner_id')
                  .in('id', body.unit_ids)
                  .eq('site_id', body.site_id)
                  .not('owner_id', 'is', null);

                if (conflictingUnits && conflictingUnits.length > 0) {
                  const conflicts = conflictingUnits.filter(u => u.owner_id !== invitedUserId);
                  if (conflicts.length > 0) {
                    return new Response(
                      JSON.stringify({
                        error: 'Some units are already owned',
                        conflicts: conflicts.map(u => u.unit_number)
                      }),
                      { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    );
                  }
                }

                const { error: unitError } = await adminClient
                  .from('units')
                  .update({
                    owner_id: invitedUserId,
                    owner_name: body.full_name || '',
                    owner_email: body.email
                  })
                  .in('id', body.unit_ids)
                  .eq('site_id', body.site_id);

                if (unitError) {
                  console.error('[manage-users] Unit assignment failed:', unitError.message);
                  throw unitError;
                }
              }

              console.log('[manage-users] Generated invite link for user:', body.email, '| Role:', body.role);
              return new Response(
                JSON.stringify({
                  success: true,
                  message: 'Invite link generated. User will receive email.',
                  invite_link: linkData.properties?.action_link
                }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
            }

            invitedUserId = inviteData.user.id;
            console.log('[manage-users] Sent invite email to user:', body.email);
          } catch (e) {
            console.error('[manage-users] Invite process failed:', e instanceof Error ? e.message : String(e));
            throw e;
          }
        }

        const { error: roleError } = await adminClient
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
          const { data: conflictingUnits } = await adminClient
            .from('units')
            .select('id, unit_number, owner_id')
            .in('id', body.unit_ids)
            .eq('site_id', body.site_id)
            .not('owner_id', 'is', null);

          if (conflictingUnits && conflictingUnits.length > 0) {
            const conflicts = conflictingUnits.filter(u => u.owner_id !== invitedUserId);
            if (conflicts.length > 0) {
              return new Response(
                JSON.stringify({
                  error: 'Some units are already owned',
                  conflicts: conflicts.map(u => u.unit_number)
                }),
                { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
            }
          }

          const { data: authUser } = await adminClient
            .schema('auth')
            .from('users')
            .select('email')
            .eq('id', invitedUserId)
            .maybeSingle();

          const { data: profile } = await adminClient
            .from('profiles')
            .select('full_name')
            .eq('id', invitedUserId)
            .maybeSingle();

          const { error: unitError } = await adminClient
            .from('units')
            .update({
              owner_id: invitedUserId,
              owner_name: profile?.full_name || '',
              owner_email: authUser?.email || ''
            })
            .in('id', body.unit_ids)
            .eq('site_id', body.site_id);

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

        const { error: roleError } = await adminClient
          .from('user_site_roles')
          .update({ role: body.role })
          .eq('user_id', body.user_id)
          .eq('site_id', body.site_id);

        if (roleError) {
          console.error('[manage-users] Role update failed:', roleError.message);
          throw roleError;
        }

        const { error: clearError } = await adminClient
          .from('units')
          .update({ owner_id: null })
          .eq('owner_id', body.user_id)
          .eq('site_id', body.site_id);

        if (clearError) {
          console.error('[manage-users] Unit cleanup failed:', clearError.message);
        }

        if (body.role === 'homeowner' && body.unit_ids && body.unit_ids.length > 0) {
          const { data: conflictingUnits } = await adminClient
            .from('units')
            .select('id, unit_number, owner_id')
            .in('id', body.unit_ids)
            .eq('site_id', body.site_id)
            .not('owner_id', 'is', null);

          if (conflictingUnits && conflictingUnits.length > 0) {
            const conflicts = conflictingUnits.filter(u => u.owner_id !== body.user_id);
            if (conflicts.length > 0) {
              return new Response(
                JSON.stringify({
                  error: 'Some units are already owned',
                  conflicts: conflicts.map(u => u.unit_number)
                }),
                { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
            }
          }

          const { data: authUser } = await adminClient
            .schema('auth')
            .from('users')
            .select('email')
            .eq('id', body.user_id)
            .maybeSingle();

          const { data: profile } = await adminClient
            .from('profiles')
            .select('full_name')
            .eq('id', body.user_id)
            .maybeSingle();

          const { error: unitError } = await adminClient
            .from('units')
            .update({
              owner_id: body.user_id,
              owner_name: profile?.full_name || '',
              owner_email: authUser?.email || ''
            })
            .in('id', body.unit_ids)
            .eq('site_id', body.site_id);

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

        const { error } = await adminClient
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
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
