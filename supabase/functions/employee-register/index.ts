import { cors, reply, serviceClient, callerClient, requestBody } from '../_shared/account.ts';
const branchCodes: Record<string,string> = { 'جاليري':'gallery','ذافيو':'theview','سلام':'salam','القصر':'qasr','المملكة':'kingdom','شرق':'east' };
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' });
  try {
    const caller = callerClient(req);
    if (!caller) return reply(401, { error: 'authentication_required' });
    const { data: identity, error: authError } = await caller.auth.getUser();
    if (authError || !identity.user) return reply(401, { error: 'authentication_required' });
    const { data: account, error: denied } = await caller.rpc('get_my_account');
    if (denied || account?.role !== 'manager' || !branchCodes[account.branch]) return reply(403, { error: 'operation_unavailable' });
    const body = await requestBody(req);
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (name.length < 1 || name.length > 120 || typeof body.requestId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(body.requestId)) return reply(400, { error: 'invalid_request' });
    const profileId = 'employee-' + body.requestId;
    const admin = serviceClient();
    const { data: exists, error: existsError } = await admin.rpc('branch_registration_exists', { actor_uid: identity.user.id, profile_id: profileId });
    if (existsError || typeof exists !== 'boolean') return reply(403, { error: 'operation_unavailable' });
    if (exists === true) return reply(200, { success: true });
    const { data: password, error: passwordError } = await admin.rpc('employee_default_password');
    if (passwordError || typeof password !== 'string' || password.length < 6) return reply(503, { error: 'operation_unavailable' });
    const email = branchCodes[account.branch] + '.emp.' + body.requestId.replaceAll('-','') + '@iams.sa';
    const { data: created, error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (createError || !created.user) return reply(503, { error: 'operation_unavailable' });
    const { error: saveError } = await admin.rpc('complete_branch_registration', { actor_uid: identity.user.id, target_uid: created.user.id, profile_id: profileId, employee_name: name, expected_branch: account.branch });
    if (saveError) {
      // An HTTP failure may follow a committed transaction. Never delete a linked account.
      const check = await admin.rpc('branch_registration_exists', { actor_uid: identity.user.id, profile_id: profileId });
      if (!check.error && check.data === true) return reply(200, { success: true });
      if (!check.error && check.data === false) await admin.auth.admin.deleteUser(created.user.id);
      return reply(503, { error: 'operation_unavailable' });
    }
    return reply(200, { success: true });
  } catch { return reply(400, { error: 'operation_unavailable' }); }
});
