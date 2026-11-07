import { createClient } from '@supabase/supabase-js';
import { verifyGithubToken } from './auth.ts';
import { importRows } from './import.ts';
Deno.serve(async request => {
 if(request.method!=='POST')return new Response('Method not allowed',{status:405});
 try{await verifyGithubToken((request.headers.get('authorization') || '').replace(/^Bearer /,''));}
 catch{return new Response('Unauthorized',{status:401});}
 try{
  const body=await request.text();
  if(new TextEncoder().encode(body).byteLength>5*1024*1024)return new Response('Payload too large',{status:413});
  const raw=JSON.parse(body);
  const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
  return Response.json(await importRows(client,raw));
 }catch{return new Response('Import failed; source data and credentials are not logged',{status:400});}
});
