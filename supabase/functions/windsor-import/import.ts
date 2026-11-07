export const locationBranches: Readonly<Record<string,string>> = Object.freeze({
 'locations/16510748030849104251':'شرق','locations/3102684010058296265':'المملكة',
 'locations/9902225787849509285':'سلام','locations/5313787192350057859':'القصر',
 'locations/3108762223721282674':'جاليري','locations/10045625494363697870':'ذافيو',
});
export function normalizeRows(rows: unknown) {
 if (!Array.isArray(rows) || rows.length>20000) throw new Error('Invalid source rows');
 const ratings: Record<string,number>={ONE:1,TWO:2,THREE:3,FOUR:4,FIVE:5};
 const seen=new Map<string,Record<string,unknown>>();
 for (const row of rows) {
  const branch=locationBranches[String(row?.location_id || row?.account_id || '')];
  const rating=ratings[String(row?.review_star_rating)] || Number(row?.review_star_rating);
  const date=new Date(row?.review_create_time);
  if (!branch || !row?.review_id || !row?.review_create_time || !Number.isFinite(date.getTime()) || !Number.isInteger(rating) || rating<1 || rating>5) throw new Error('Invalid review');
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);
  const get=(key:string)=>parts.find(p=>p.type===key)!.value;
  const id=String(row.review_id), data={id,branch,rating:String(rating),reviewerName:String(row.review_reviewer || 'عميل'),comment:String(row.review_comment || ''),date:`${get('day')}-${get('month')}-${get('year')}`,time:`${get('hour')}:${get('minute')}`};
  if (seen.has(id) && JSON.stringify(seen.get(id))!==JSON.stringify(data)) throw new Error('Conflicting source identity');
  seen.set(id,data);
 }
 return [...seen.values()];
}
export async function importRows(client: any, raw: unknown) {
 const reviews=normalizeRows(raw);
 const result={sourceReviews:reviews.length,newReviews:0,updatedReviews:0,unchangedReviews:0};
 for(let offset=0;offset<reviews.length;offset+=100){
  const chunk=reviews.slice(offset,offset+100), ids=chunk.map(r=>r.id);
  const {data:existing,error:readError}=await client.from('reviews').select('id,data').in('id',ids);
  if(readError)throw new Error('Database read failed');
  const previous=new Map<string,any>((existing || []).map((r:any)=>[r.id,r.data]));
  const changed=[];
  for(const review of chunk){
   const old=previous.get(String(review.id));
   if(old && Object.entries(review).every(([key,value])=>old[key]===value)){result.unchangedReviews++;continue;}
   const links=old ? {linkedEmployeeIds:old.linkedEmployeeIds || [],...(old.linkedShiftId ? {linkedShiftId:old.linkedShiftId} : {})} : {linkedEmployeeIds:[]};
   changed.push({id:review.id,data:{...review,...links,batchId:'windsor-api'}});
   if(old)result.updatedReviews++;else result.newReviews++;
  }
  if(changed.length){const {error}=await client.from('reviews').upsert(changed,{onConflict:'id'});if(error)throw new Error('Database write failed');}
 }
 return result;
}
