import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface RequestBody {
  action: 'list_sites' | 'list_units' | 'complete_onboarding';
  site_id?: string;
  unit_ids?: string[];
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
      console.error('[self-onboarding] Missing Authorization header');
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
      console.error('[self-onboarding] Authentication failed:', authError?.message || 'Invalid token');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const body: RequestBody = await req.json();
    console.log('[self-onboarding] Action:', body.action, '| User:', user.email);

    switch (body.action) {
      case 'list_sites': {
        const { data: sites, error } = await adminClient
          .from('sites')
          .select('id, name')
          .eq('is_active', true)
          .order('name');

        if (error) {
          console.error('[self-onboarding] Failed to list sites:', error.message);
          throw error;
        }

        console.log('[self-onboarding] Listed', sites?.length || 0, 'sites');
        return new Response(
          JSON.stringify({ sites: sites || [] }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'list_units': {
        if (!body.site_id) {
          return new Response(
            JSON.stringify({ error: 'Site ID is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data: units, error } = await adminClient
          .from('units')
          .select('id, unit_number')
          .eq('site_id', body.site_id)
          .is('owner_id', null)
          .order('unit_number');

        if (error) {
          console.error('[self-onboarding] Failed to list units:', error.message);
          throw error;
        }

        console.log('[self-onboarding] Listed', units?.length || 0, 'available units for site:', body.site_id);
        return new Response(
          JSON.stringify({ units: units || [] }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'complete_onboarding': {
        if (!body.site_id || !body.unit_ids || body.unit_ids.length === 0) {
          return new Response(
            JSON.stringify({ error: 'Site ID and at least one unit are required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data: existingRole } = await adminClient
          .from('user_site_roles')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();

        if (existingRole) {
          console.error('[self-onboarding] User already onboarded:', user.email);
          return new Response(
            JSON.stringify({ error: 'You have already completed onboarding' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data: conflictingUnits } = await adminClient
          .from('units')
          .select('id, unit_number, owner_id')
          .in('id', body.unit_ids)
          .eq('site_id', body.site_id)
          .not('owner_id', 'is', null);

        if (conflictingUnits && conflictingUnits.length > 0) {
          return new Response(
            JSON.stringify({
              error: 'Some units are already owned',
              conflicts: conflictingUnits.map(u => u.unit_number)
            }),
            { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { error: roleError } = await adminClient
          .from('user_site_roles')
          .insert({
            user_id: user.id,
            site_id: body.site_id,
            role: 'homeowner',
            is_active: true,
          });

        if (roleError) {
          console.error('[self-onboarding] Role assignment failed:', roleError.message);
          throw roleError;
        }

        const { data: profile } = await adminClient
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .maybeSingle();

        const { error: unitError } = await adminClient
          .from('units')
          .update({
            owner_id: user.id,
            owner_name: profile?.full_name || '',
            owner_email: user.email || ''
          })
          .in('id', body.unit_ids)
          .eq('site_id', body.site_id)
          .is('owner_id', null);

        if (unitError) {
          console.error('[self-onboarding] Unit assignment failed:', unitError.message);
          throw unitError;
        }

        console.log('[self-onboarding] Successfully onboarded user:', user.email, '| Site:', body.site_id, '| Units:', body.unit_ids.length);
        return new Response(
          JSON.stringify({ success: true, message: 'Onboarding completed successfully' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default: {
        console.error('[self-onboarding] Invalid action:', body.action);
        return new Response(
          JSON.stringify({ error: 'Invalid action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('[self-onboarding] Error:', errorMessage, error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
