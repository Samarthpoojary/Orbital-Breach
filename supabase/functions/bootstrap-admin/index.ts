import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json' };
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: cors });
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'METHOD_NOT_ALLOWED' });
  let body: { email?: unknown; password?: unknown; setup_code?: unknown };
  try { body = await req.json(); } catch { return reply(400, { error: 'INVALID_JSON' }); }
  const setupCode = Deno.env.get('ADMIN_SETUP_CODE');
  if (!setupCode || typeof body.setup_code !== 'string' || body.setup_code.length !== setupCode.length || !crypto.subtle) return reply(403, { error: 'INVALID_SETUP_CODE' });
  const enc = new TextEncoder(); const [a, b] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(body.setup_code)), crypto.subtle.digest('SHA-256', enc.encode(setupCode))]);
  const aa = new Uint8Array(a); const bb = new Uint8Array(b); let diff = 0; for (let i = 0; i < aa.length; i++) diff |= aa[i] ^ bb[i];
  if (diff !== 0) return reply(403, { error: 'INVALID_SETUP_CODE' });
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12 || password.length > 128) return reply(400, { error: 'INVALID_ADMIN_DETAILS' });
  const url = Deno.env.get('SUPABASE_URL'); const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return reply(500, { error: 'SERVER_CONFIGURATION_ERROR' });
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { admin_candidate: true } });
  if (error || !created.user) return reply(409, { error: 'ADMIN_CREATION_FAILED' });
  const { error: promotionError } = await admin.rpc('bootstrap_admin', { p_auth_user_id: created.user.id });
  if (promotionError) { await admin.auth.admin.deleteUser(created.user.id); return reply(409, { error: 'BOOTSTRAP_ALREADY_USED' }); }
  return reply(201, { message: 'ADMIN_CREATED', instruction: 'Remove the ADMIN_SETUP_CODE secret and undeploy this function now.' });
});

