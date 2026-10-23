import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json' };
const failure = (status = 400) => new Response(JSON.stringify({ error: 'CREW_REGISTRATION_FAILED' }), { status, headers: cors });
const sha256 = async (value: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
const sameBytes = (a: Uint8Array, b: Uint8Array) => { let diff = 0; for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]; return diff === 0; };
const hex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return failure(405);
  if (Number(req.headers.get('content-length') ?? '0') > 4000) return failure(413);

  let body: { team_name?: unknown; participant1_name?: unknown; participant2_name?: unknown; password?: unknown; confirm_password?: unknown; registration_code?: unknown };
  try { body = await req.json(); } catch { return failure(); }
  const teamName = typeof body.team_name === 'string' ? body.team_name.trim() : '';
  const name1 = typeof body.participant1_name === 'string' ? body.participant1_name.trim() : '';
  const name2 = typeof body.participant2_name === 'string' ? body.participant2_name.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const confirm = typeof body.confirm_password === 'string' ? body.confirm_password : '';
  const registrationCode = typeof body.registration_code === 'string' ? body.registration_code : '';
  const expectedCode = Deno.env.get('TEAM_REGISTRATION_CODE') ?? '';
  if (!expectedCode || registrationCode.length < 8 || registrationCode.length > 128 || !sameBytes(await sha256(registrationCode), await sha256(expectedCode))) return failure(403);
  if (teamName.length < 2 || teamName.length > 48 || name1.length < 1 || name1.length > 80 || name2.length < 1 || name2.length > 80 || password.length < 10 || password.length > 128 || password !== confirm) return failure();

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !serviceKey || !anonKey) return failure(500);

  const digest = hex(await sha256(teamName.toLowerCase()));
  const loginEmail = `crew-${digest}@teams.orbitalbreach.invalid`;
  const memberEmail = `member-${digest}@teams.orbitalbreach.invalid`;
  const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const auth = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: created, error: createError } = await service.auth.admin.createUser({
    email: loginEmail,
    password,
    email_confirm: true,
    user_metadata: { team_name: teamName, participant1_name: name1, participant2_name: name2 },
  });
  if (createError || !created.user) return failure(409);

  const { error: registrationError } = await service.rpc('register_team_account', {
    p_auth_user_id: created.user.id,
    p_team_name: teamName,
    p_participant1_name: name1,
    p_participant2_name: name2,
    p_login_email: loginEmail,
    p_secondary_email: memberEmail,
  });
  if (registrationError) {
    await service.auth.admin.deleteUser(created.user.id);
    return failure(409);
  }

  const { data: signedIn, error: signInError } = await auth.auth.signInWithPassword({ email: loginEmail, password });
  if (signInError || !signedIn.session) return failure(500);
  return new Response(JSON.stringify({ access_token: signedIn.session.access_token, refresh_token: signedIn.session.refresh_token }), { status: 201, headers: cors });
});

