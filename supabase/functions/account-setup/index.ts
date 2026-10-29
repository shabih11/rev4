import { cors, reply, serviceClient, publicClient, callerClient, requestBody, normalizePassword } from '../_shared/account.ts';
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' });
  try {
    const caller = callerClient(req);
    if (!caller) return reply(401, { error: 'authentication_required' });
    const { data: identity, error: authError } = await caller.auth.getUser();
    if (authError || !identity.user) return reply(401, { error: 'authentication_required' });
    const { data: account, error: denied } = await caller.rpc('get_my_account');
    if (denied || !account || typeof identity.user.email !== 'string' || typeof account.mustChangePassword !== 'boolean') return reply(403, { error: 'operation_unavailable' });
    const body = await requestBody(req);
    const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
    if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username) || ['admin','administrator','root','support'].includes(username)) return reply(400, { error: 'invalid_username' });
    const password = typeof body.password === 'string' ? normalizePassword(body.password) : '';
    const mustChange = account.mustChangePassword === true;
    const admin = serviceClient();
    if (mustChange) {
      if (password.trim().length < 8 || password.length > 128) return reply(400, { error: 'invalid_password' });
      const { data: initial, error: defaultError } = await admin.rpc('employee_default_password');
      if (defaultError || typeof initial !== 'string') return reply(503, { error: 'operation_unavailable' });
      if (password === normalizePassword(initial)) return reply(400, { error: 'default_password' });
    }
    const { error: usernameError } = await caller.rpc('set_my_username', { requested_username: username });
    if (usernameError) return reply(409, { error: usernameError.code === '23505' ? 'username_taken' : 'username_unavailable' });
    if (!mustChange) return reply(200, { success: true });
    // The verified caller is always the target. Request fields cannot select another account.
    const { error: passwordError } = await admin.auth.admin.updateUserById(identity.user.id, { password });
    if (passwordError) return reply(400, { error: 'password_update_failed' });
    const { error: sessionError } = await admin.rpc('finish_self_account_setup', { target_uid: identity.user.id });
    if (sessionError) return reply(503, { error: 'reauthentication_required' });
    const client = publicClient();
    const { data, error: loginError } = await client.auth.signInWithPassword({ email: identity.user.email!, password });
    if (loginError || !data.session) return reply(503, { error: 'reauthentication_required' });
    return reply(200, { success: true, access_token: data.session.access_token, refresh_token: data.session.refresh_token });
  } catch { return reply(400, { error: 'operation_unavailable' }); }
});
