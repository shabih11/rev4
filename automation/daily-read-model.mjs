import { pathToFileURL } from 'node:url';
import { encode, decode, firestoreTransport } from './windsor-sync.mjs';
const root = 'projects/iamspec/databases/(default)/documents';
const app = `${root}/apps/rev4`;
const riyadhDay = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' });
const plain = doc => Object.fromEntries(Object.entries(doc.fields || {}).map(([k,v]) => [k,decode(v)]));
export function buildDailyModel(profiles, reviews, notes, shifts, generatedAt = new Date().toISOString()) {
  const directory = profiles.map(p => {
    // Explicit allowlist: never copy account email, credentials or free-form messages.
    const out = {};
    for (const k of ['id','name','branch','role','points','reviewsCount','stats','monthReviewsCount','manualStats','code','aliases','assignedBranches']) if (p[k] !== undefined) out[k] = p[k];
    out.imageUrl = ''; // The UI already uses its bundled unified staff image.
    return out;
  });
  const packed = reviews.map(r => ({ i:r.id,b:r.branch,r:r.rating,d:r.date,t:r.time,e:r.linkedEmployeeIds || [] }));
  const cleanNotes = notes.map(n => ({ id:n.id,branch:n.branch,type:'gap',date:n.date || '',title:['شكوى','سلامة'].includes(n.title) ? n.title : '',employees:(n.employees || []).map(e => ({id:e.id,name:''})) }));
  const hours = {};
  for (const s of shifts) {
    if (!s.time || !s.endTime) continue;
    const minutes = t => { const [h,m] = t.split(':').map(Number); return h*60+m; };
    let duration = minutes(s.endTime)-minutes(s.time);
    if (duration < 0) duration += 1440;
    if (!Number.isFinite(duration)) continue;
    for (const id of new Set((s.employees || []).map(e => e.id))) hours[id] = (hours[id] || 0) + duration / 60;
  }
  const model = { version:1,day:riyadhDay(),generatedAt,directory,reviews:packed,notes:cleanNotes,hours };
  if (Buffer.byteLength(JSON.stringify(model)) > 700000) throw new Error('Daily summary is too large; partition before publishing');
  return model;
}
export async function refreshDailyModel(post, { force = false } = {}) {
  const found = (await post(`${root}:batchGet`, { documents:[app] })).find(x => x.found)?.found;
  const old = found ? plain(found).dailyReadModel : null;
  if (!force && old?.day === riyadhDay() && old.version === 1) return { reused:true,writes:0 };
  const query = async collectionId => (await post(`${app}:runQuery`, { structuredQuery:{ from:[{collectionId}] } })).filter(x => x.document).map(x => plain(x.document));
  const profiles = await query('profiles');
  const reviews = await query('reviewSignals');
  const notes = await query('noteSignals');
  const shifts = await query('shifts');
  const model = buildDailyModel(profiles,reviews,notes,shifts);
  await post(`${root}:commit`, { writes:[{ update:{ name:app,fields:{ dailyReadModel:encode(model) } },updateMask:{fieldPaths:['dailyReadModel']},currentDocument:found?{updateTime:found.updateTime}:{exists:false} }] });
  const actual = (await post(`${root}:batchGet`,{documents:[app]})).find(x=>x.found)?.found;
  if (!actual || JSON.stringify(plain(actual).dailyReadModel) !== JSON.stringify(model)) {
    // Firestore may reorder map keys; compare stable identifying fields instead.
    const saved = actual ? plain(actual).dailyReadModel : null;
    if (!saved || saved.generatedAt !== model.generatedAt || saved.reviews.length !== reviews.length || saved.directory.length !== profiles.length) throw new Error('Daily summary verification failed');
  }
  return { reused:false,writes:1,sourceReads:profiles.length+reviews.length+notes.length+shifts.length,reviewCount:reviews.length,employees:profiles.length,bytes:Buffer.byteLength(JSON.stringify(model)),generatedAt:model.generatedAt };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify(await refreshDailyModel(firestoreTransport(process.env.GOOGLE_ACCESS_TOKEN)))); }
  catch { console.error('Daily summary failed; source contents and credentials are not logged');process.exitCode=1; }
}
