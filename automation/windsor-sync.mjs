// Server-only export. Never log a URL containing Windsor's query-string credential.
import { locationBranches } from '../supabase/functions/windsor-import/import.ts';
export async function fetchSnapshot(key,from,to,fetcher=fetch){
 if(!key || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from>to)throw Error('Invalid Windsor configuration');
 const url=new URL('https://connectors.windsor.ai/google_my_business');
 for(const [name,value]of Object.entries({api_key:key,date_from:from,date_to:to,select_accounts:Object.keys(locationBranches).join(','),fields:'location_id,review_id,review_star_rating,review_comment,review_create_time,review_update_time'}))url.searchParams.set(name,value);
 let response;try{response=await fetcher(url,{signal:AbortSignal.timeout(180000)});}catch{throw Error('Windsor connection failed');}
 if(!response.ok)throw Error('Windsor request failed');
 const body=await response.json(),rows=Array.isArray(body)?body:body.data;
 if(!Array.isArray(rows) || body.status && !['done','success'].includes(body.status) || body.total_rows!==undefined && Number(body.total_rows)!==rows.length)throw Error('Incomplete Windsor response');
 return rows;
}
if(process.argv[1] && import.meta.url===new URL(process.argv[1],'file:').href){
 try{
  const from=process.env.WINDSOR_DATE_FROM || '2026-08-01';
  const to=process.env.WINDSOR_DATE_TO || new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Riyadh'});
  const rows=await fetchSnapshot(process.env.WINDSOR_API_KEY,from,to);
  const oidc=new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL);oidc.searchParams.set('audience','rev4-windsor-supabase');
  const tokenResponse=await fetch(oidc,{headers:{Authorization:`Bearer ${process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}`},signal:AbortSignal.timeout(15000)});
  if(!tokenResponse.ok)throw Error('GitHub identity request failed');
  const {value:token}=await tokenResponse.json();
  const response=await fetch('https://zcnfzrkegodvrtzimlnn.supabase.co/functions/v1/windsor-import',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(rows),signal:AbortSignal.timeout(180000)});
  if(!response.ok)throw Error('Supabase import failed');
  console.log(JSON.stringify(await response.json()));
 }catch{console.error('Daily sync failed; credentials and source contents are not logged');process.exitCode=1;}
}
