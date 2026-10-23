import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json' };
const genericFailure = () => new Response(JSON.stringify({ error: 'INVALID_CREW_CREDENTIALS' }), { status: 401, headers: cors });
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'METHOD_NOT_ALLOWED' }), { status: 405, headers: cors });
  if (Number(req.headers.get('content-length') ?? '0') > 4000) return new Response(JSON.stringify({ error: 'REQUEST_TOO_LARGE' }), { status: 413, headers: cors });
  let body: { email?: unknown; password?: unknown };
  try { body = await req.json(); } catch { return genericFailure(); }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (email.length > 254 || password.length > 128 || !email || !password) return genericFailure();
  const url = Deno.env.get('SUPABASE_URL'); const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'); const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !serviceKey || !anonKey) return new Response(JSON.stringify({ error: 'SERVER_CONFIGURATION_ERROR' }), { status: 500, headers: cors });
  const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: primaryEmail } = await service.rpc('resolve_team_login', { p_email: email });
  // Keep one generic response and never return the looked-up account email.
  const auth = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await auth.auth.signInWithPassword({ email: primaryEmail ?? email, password });
  if (!primaryEmail || error || !data.session) return genericFailure();
  return new Response(JSON.stringify({ access_token: data.session.access_token, refresh_token: data.session.refresh_token }), { status: 200, headers: cors });
});

