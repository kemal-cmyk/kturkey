import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const reqBody = await req.json();
    const email = reqBody.email;
    const password = reqBody.password;
    const full_name = reqBody.full_name;

    if (!email || !password) {
      return new Response(
        JSON.stringify({ error: "Email and password required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
      return new Response(
        JSON.stringify({ error: "Configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create user via auth admin API
    const authUrl = supabaseUrl + "/auth/v1/admin/users";
    const authRes = await fetch(authUrl, {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + supabaseServiceKey,
        "apikey": supabaseServiceKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: email,
        password: password,
        email_confirm: true,
      }),
    });

    if (!authRes.ok) {
      const errText = await authRes.text();
      return new Response(
        JSON.stringify({ error: "Auth failed", details: errText }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authData = await authRes.json();
    const userId = authData.user?.id;

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "No user ID returned", authData: authData }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create profile
    const profileUrl = supabaseUrl + "/rest/v1/profiles";
    const profileRes = await fetch(profileUrl, {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + supabaseServiceKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: userId,
        full_name: full_name || email,
        is_super_admin: true,
        language: "en",
      }),
    });

    if (!profileRes.ok) {
      const errText = await profileRes.text();
      return new Response(
        JSON.stringify({ error: "Profile failed: " + errText }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Superadmin created",
        user: { id: userId, email: email, full_name: full_name || email },
      }),
      { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
