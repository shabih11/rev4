import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
export const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
export const reply = (status: number, data: object) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const options = { auth: { persistSession: false, autoRefreshToken: false } };
export const serviceClient = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, options);
export const publicClient = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, options);
export function callerClient(req: Request) {
  const authorization = req.headers.get('Authorization') || '';
  if (!authorization.startsWith('Bearer ')) return null;
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { ...options, global: { headers: { Authorization: authorization } } });
}
export async function requestBody(req: Request) {
  if (Number(req.headers.get('content-length') || 0) > 4096 || !req.body) throw new Error('invalid-request');
  const reader = req.body.getReader(), decoder = new TextDecoder();
  let text = '', size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 4096) { await reader.cancel(); throw new Error('invalid-request'); }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  const body = JSON.parse(text);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('invalid-request');
  return body;
}
export const normalizePassword = (value: string) => /^[\d٠-٩۰-۹]+$/.test(value.trim()) ? value.trim().replace(/[٠-٩]/g, x => String(x.charCodeAt(0)-0x660)).replace(/[۰-۹]/g, x => String(x.charCodeAt(0)-0x6f0)) : value;
