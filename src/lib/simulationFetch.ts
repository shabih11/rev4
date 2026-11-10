import { simulationSnapshot } from './simulationState';
const reads = new Set(['get_my_account', 'get_read_model', 'get_employee_features', 'read_rows', 'get_employee_last_presence', 'get_branch_last_presence']);
const tables = new Set(['app_state', 'sea_mission_completions', 'management_contact', 'timeline_events', 'employee_merge_requests']);
const denied = () => new Response(JSON.stringify({ code: '42501', message: 'المحاكاة للقراءة فقط؛ عودي إلى حساب المسؤول لتنفيذ التغييرات.' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
export async function simulationFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const context = simulationSnapshot();
  const request = new Request(input, init);
  const url = new URL(request.url);
  const execute = async (next: Request) => {
    const response = await fetch(next);
    if (simulationSnapshot() !== context) throw new DOMException('Account context changed', 'AbortError');
    return response;
  };
  if (!context) return execute(request);
  // Auth keeps the original actor and refresh token; no target login is performed.
  if (url.pathname.startsWith('/auth/v1/')) {
    if (url.pathname === '/auth/v1/user' && request.method === 'GET' || url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'refresh_token') return execute(request);
    return denied();
  }
  if (['/rest/v1/rpc/stop_simulation', '/rest/v1/rpc/simulation_targets', '/rest/v1/rpc/start_simulation'].includes(url.pathname)) return execute(request);
  // Weather and artwork are shared member resources, never employee activity.
  if (url.pathname === '/functions/v1/riyadh-weather' && request.method === 'GET' || url.pathname.startsWith('/storage/v1/object/sign/avatar-store/') && request.method === 'POST' || url.pathname.startsWith('/storage/v1/object/sign/avatar-store/') && request.method === 'GET') return execute(request);
  const operation = url.pathname.split('/rest/v1/rpc/')[1];
  const table = url.pathname.split('/rest/v1/')[1];
  if (!(operation && reads.has(operation)) && !(request.method === 'GET' && table && tables.has(table))) return denied();
  const args = operation && request.method === 'POST' ? await request.json() : {};
  const headers = new Headers(request.headers);
  headers.set('Content-Type', 'application/json');
  headers.delete('Accept'); headers.delete('Range'); headers.delete('Range-Unit');
  const start = Number(url.searchParams.get('offset') || request.headers.get('Range')?.split('-')[0] || 0);
  const limit = Number(url.searchParams.get('limit') || 500);
  const response = await execute(new Request(`${url.origin}/rest/v1/rpc/simulation_read`, {
    method: 'POST', headers, signal: request.signal,
    body: JSON.stringify({ simulation_id: context.id, operation: operation || table, args,
      query: Object.fromEntries(url.searchParams), row_offset: start, row_limit: limit }),
  }));
  if (!response.ok) return response;
  const data = await response.json();
  const single = request.headers.get('Accept')?.includes('application/vnd.pgrst.object+json');
  if (single && Array.isArray(data) && data.length > 1) return denied();
  return new Response(JSON.stringify(single && Array.isArray(data) ? data[0] || null : data), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
