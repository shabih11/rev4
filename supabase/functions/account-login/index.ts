import { cors, reply, serviceClient, publicClient, requestBody, normalizePassword } from '../_shared/account.ts';
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' });
  try {
    const body = await requestBody(req);
    const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
    if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username) || typeof body.password !== 'string' || body.password.length > 1024) return reply(401, { error: 'invalid_credentials' });
    const { data: email, error } = await serviceClient().rpc('resolve_username_login', { requested_username: username, client_fingerprint: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown' });
    if (error) return reply(error.code === '54000' ? 429 : 401, { error: error.code === '54000' ? 'over_request_rate_limit' : 'invalid_credentials' });
    if (typeof email !== 'string' || !email) return reply(401, { error: 'invalid_credentials' });
    const client = publicClient();
    const { data, error: loginError } = await client.auth.signInWithPassword({ email, password: normalizePassword(body.password) });
    if (loginError || !data.session) return reply(401, { error: 'invalid_credentials' });
    const { data: account, error: denied } = await client.rpc('get_my_account');
    if (denied || !account) { await client.auth.signOut({ scope: 'local' }); return reply(401, { error: 'invalid_credentials' }); }
    return reply(200, { access_token: data.session.access_token, refresh_token: data.session.refresh_token });
  } catch { return reply(401, { error: 'invalid_credentials' }); }
});
