import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const reply = (status: number, error?: string) => new Response(JSON.stringify(error ? { error } : { success: true }), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return reply(405, 'method_not_allowed');
  try {
    const authorization = req.headers.get('Authorization') || '';
    if (!authorization.startsWith('Bearer ')) return reply(401, 'authentication_required');
    const url = Deno.env.get('SUPABASE_URL')!;
    const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data: identity, error: identityError } = await caller.auth.getUser();
    if (identityError || !identity.user) return reply(401, 'authentication_required');
    const { data: account, error: accountError } = await caller.rpc('get_my_account');
    if (accountError || account?.role !== 'admin') return reply(403, 'operation_unavailable');
    if (Number(req.headers.get('content-length') || 0) > 4096) return reply(400, 'invalid_request');
    const body = await req.json();
    if (!body || typeof body.profileId !== 'string' || body.profileId.length > 200 || !['email', 'reset'].includes(body.action)) return reply(400, 'invalid_request');
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (body.action === 'email' && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return reply(400, 'invalid_email');
    // The caller's live membership and the target's employee role/branch are checked in SQL.
    const { data: target, error: denied } = await caller.rpc('authorize_employee_account', { target_profile: body.profileId });
    if (denied || typeof target !== 'string') return reply(403, 'operation_unavailable');
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
    let attributes;
    if (body.action === 'reset') {
      const { data: password, error } = await admin.rpc('employee_default_password');
      if (error || typeof password !== 'string' || password.length < 6) return reply(503, 'reset_not_configured');
      attributes = { password };
    } else attributes = { email, email_confirm: true };
    const { error } = await admin.auth.admin.updateUserById(target, attributes);
    if (error) return reply(400, 'operation_unavailable');
    const { error: cleanupError } = await admin.rpc('finish_employee_account_change', { target_uid: target });
    if (cleanupError) return reply(503, 'session_cleanup_failed');
    return reply(200);
  } catch { return reply(400, 'operation_unavailable'); }
});
