import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { normalizeWindsorReviews } from '../src/lib/windsorReviewModel.mjs';

export const locationBranches = Object.freeze({
  'locations/16510748030849104251': 'شرق',
  'locations/3102684010058296265': 'المملكة',
  'locations/9902225787849509285': 'سلام',
  'locations/5313787192350057859': 'القصر',
  'locations/3108762223721282674': 'جاليري',
  'locations/10045625494363697870': 'ذافيو',
});
const root = 'projects/iamspec/databases/(default)/documents';
const app = `${root}/apps/rev4`;
export const hash = value => createHash('sha256').update(value).digest('hex');
const path = (collection, id) => `${app}/${collection}/${hash(id)}`;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export const encode = value => value === null ? { nullValue: null }
  : typeof value === 'string' ? { stringValue: value }
  : typeof value === 'boolean' ? { booleanValue: value }
  : typeof value === 'number' ? (Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value })
  : Array.isArray(value) ? { arrayValue: { values: value.map(encode) } }
  : { mapValue: { fields: fields(value) } };
const fields = object => Object.fromEntries(Object.entries(object).filter(([, v]) => v !== undefined).map(([k, v]) => [k, encode(v)]));
export const decode = value => value.stringValue ?? (value.integerValue !== undefined ? Number(value.integerValue)
  : value.doubleValue ?? value.booleanValue ?? (value.arrayValue ? (value.arrayValue.values || []).map(decode)
    : value.mapValue ? Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([k, v]) => [k, decode(v)])) : null));
const plain = doc => ({ ...doc, data: Object.fromEntries(Object.entries(doc.fields || {}).map(([k, v]) => [k, decode(v)])) });

function stamp(date, time = '00:00') {
  const iso = /^\d{4}-/.test(date) ? date : date.split('-').reverse().join('-');
  return Date.parse(`${iso}T${time}:00+03:00`);
}
export function findShift(review, shifts) {
  const time = stamp(review.date, review.time);
  return shifts.filter(s => {
    if (s.branch !== review.branch || !s.employees?.length) return false;
    const start = stamp(s.date, s.time);
    let end = stamp(s.endDate || s.date, s.endTime || '23:59');
    if (!s.endDate && end < start) end += 86400000;
    return time >= start && time <= end;
  }).sort((a, b) => stamp(b.date, b.time) - stamp(a.date, a.time))[0];
}

export function firestoreTransport(token) {
  if (!token) throw new Error('Google access token is required');
  return async (suffix, body) => {
    let response;
    try {
      response = await fetch(`https://firestore.googleapis.com/v1/${suffix}`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: AbortSignal.timeout(60000),
      });
    } catch { throw new Error('Firestore connection failed'); }
    if (!response.ok) throw new Error(`Firestore request failed (${response.status})`);
    return response.json();
  };
}

export async function fetchSnapshot(key, from, to) {
  if (!key) throw new Error('WINDSOR_API_KEY is required');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) throw new Error('Invalid date window');
  const url = new URL('https://connectors.windsor.ai/google_my_business');
  for (const [k, v] of Object.entries({ api_key: key, date_from: from, date_to: to,
    select_accounts: Object.keys(locationBranches).join(','),
    fields: 'account_id,location_id,location_title,review_id,review_reviewer,review_star_rating,review_comment,review_create_time,review_update_time' })) url.searchParams.set(k, v);
  let response;
  // Never log this URL or raw fetch errors: Windsor puts the credential in its query string.
  try { response = await fetch(url, { signal: AbortSignal.timeout(180000), headers: { Accept: 'application/json' } }); }
  catch { throw new Error('Windsor connection failed'); }
  if (!response.ok) throw new Error(`Windsor request failed (${response.status})`);
  let payload;
  try { payload = await response.json(); } catch { throw new Error('Invalid Windsor response'); }
  if (payload.status && !['done', 'success'].includes(payload.status)) throw new Error('Windsor export is incomplete');
  const rows = Array.isArray(payload) ? payload : payload.data;
  if (!Array.isArray(rows)) throw new Error('Windsor did not return review rows');
  if (payload.total_rows !== undefined && Number(payload.total_rows) !== rows.length) throw new Error('Windsor row count mismatch');
  return rows;
}

export async function syncReviews(raw, post, options = {}) {
  if (!Array.isArray(raw) || raw.some(r => !r?.review_id)) throw new Error('Invalid review row');
  // Validate every row before processing any month.
  if (raw.some(r => !locationBranches[String(r.account_id || r.location_id || '')])) throw new Error('Unknown Windsor location');
  const seen = new Map();
  for (const r of raw) {
    const key = String(r.review_id), value = JSON.stringify(normalizeWindsorReviews([r], locationBranches)[0]);
    if (seen.has(key) && seen.get(key) !== value) throw new Error('Conflicting duplicate review');
    seen.set(key, value);
  }
  normalizeWindsorReviews(raw, locationBranches);
  const groups = Map.groupBy(raw, r => new Date(r.review_create_time).toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' }).slice(0, 7));
  const total = { sourceReviews: 0, newReviews: 0, updatedReviews: 0, unchangedReviews: 0, writes: 0, applied: Boolean(options.apply) };
  for (const rows of groups.values()) {
    const result = await syncMonth(rows, post, options);
    for (const key of ['sourceReviews', 'newReviews', 'updatedReviews', 'unchangedReviews', 'writes']) total[key] += result[key];
  }
  return total;
}

async function syncMonth(raw, post, { apply = false } = {}) {
  // Validate the entire response before any database write.
  if (!Array.isArray(raw) || raw.some(r => !r?.review_id)) throw new Error('Invalid review row');
  const reviews = normalizeWindsorReviews(raw, locationBranches);
  if (reviews.length !== new Set(raw.map(r => String(r.review_id))).size) throw new Error('Review normalization mismatch');
  const fingerprints = Object.fromEntries(reviews.map(r => [hash(r.id), hash(JSON.stringify(r))]));
  const statePath = `${app}/syncState/windsor-v1-${reviews[0].date.slice(6)}-${reviews[0].date.slice(3, 5)}`;
  const get = async names => {
    if (!names.length) return new Map();
    const result = await post(`${root}:batchGet`, { documents: names });
    return new Map(result.filter(r => r.found).map(r => [r.found.name, plain(r.found)]));
  };
  const state = (await get([statePath])).get(statePath);
  const previous = state?.data.fingerprints || {};
  const changed = reviews.filter(r => previous[hash(r.id)] !== fingerprints[hash(r.id)]);
  const summary = { sourceReviews: reviews.length, newReviews: 0, updatedReviews: 0, unchangedReviews: reviews.length - changed.length, writes: 0, applied: apply };
  // Empty or unchanged exports never delete anything or incur writes.
  if (!changed.length) return summary;
  const earliest = Math.min(...changed.map(r => stamp(r.date))) - 86400000;
  const latest = Math.max(...changed.map(r => stamp(r.date))) + 86400000;
  const dates = [];
  for (let d = earliest; d <= latest; d += 86400000) {
    const iso = new Date(d + 10800000).toISOString().slice(0, 10);
    dates.push(iso, iso.split('-').reverse().join('-'));
  }
  const shifts = [];
  for (let i = 0; i < dates.length; i += 30) {
    const result = await post(`${app}:runQuery`, { structuredQuery: { from: [{ collectionId: 'shifts' }],
      where: { fieldFilter: { field: { fieldPath: 'date' }, op: 'IN', value: encode(dates.slice(i, i + 30)) } } } });
    shifts.push(...result.filter(r => r.document).map(r => plain(r.document).data));
  }
  for (let i = 0; i < changed.length; i += 100) {
    const chunk = changed.slice(i, i + 100);
    const existing = await get(chunk.flatMap(r => ['reviews', 'reviewSignals', 'timeline'].map(c => path(c, r.id))));
    const writes = [];
    const put = (collection, id, desired) => {
      const name = path(collection, id), old = existing.get(name);
      const patch = Object.fromEntries(Object.entries(desired).filter(([k, v]) => !same(old?.data[k], v)));
      if (!Object.keys(patch).length) return;
      writes.push({ update: { name, fields: fields(patch) }, ...(old ? { updateMask: { fieldPaths: Object.keys(patch) }, currentDocument: { updateTime: old.updateTime } } : { currentDocument: { exists: false } }) });
    };
    for (const review of chunk) {
      const old = existing.get(path('reviews', review.id))?.data;
      if (old && old.branch !== review.branch) throw new Error('Existing review branch mismatch; manual reconciliation required');
      const shift = findShift(review, shifts);
      // Preserve manually assigned links, including a deliberate empty assignment on an existing review.
      const employeeIds = old ? old.linkedEmployeeIds || [] : (shift?.employeeIds || shift?.employees.map(e => e.id) || []);
      const employees = old ? existing.get(path('timeline', review.id))?.data.employees || [] : shift?.employees || [];
      const data = { ...review, linkedEmployeeIds: employeeIds, ...(old ? {} : { batchId: 'windsor-api', ...(shift ? { linkedShiftId: shift.id } : {}) }) };
      put('reviews', review.id, data);
      put('reviewSignals', review.id, { id: review.id, branch: review.branch, rating: review.rating, date: review.date, time: review.time, linkedEmployeeIds: employeeIds });
      put('timeline', review.id, { id: review.id, type: 'review', reviewId: review.id, title: `تقييم Windsor.ai (${review.rating})`, branch: review.branch, date: review.date, time: review.time, comment: review.comment, employees, employeeIds, ...(old ? {} : { batchId: 'windsor-api' }) });
      if (!old) summary.newReviews++;
      else if (Object.entries(review).some(([k, v]) => !same(old[k], v))) summary.updatedReviews++;
      else summary.unchangedReviews++;
    }
    if (apply && writes.length) await post(`${root}:commit`, { writes });
    summary.writes += writes.length;
  }
  // The checkpoint is written last. Interrupted runs safely compare existing records on retry.
  const merged = { ...previous, ...fingerprints };
  if (Buffer.byteLength(JSON.stringify(merged)) > 700000) throw new Error('Sync checkpoint size limit reached; partition the checkpoint');
  if (apply) await post(`${root}:commit`, { writes: [{ update: { name: statePath, fields: fields({ fingerprints: merged, updatedAt: new Date().toISOString() }) }, currentDocument: state ? { updateTime: state.updateTime } : { exists: false } }] });
  summary.writes++;
  return summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' });
  const [year, month] = today.split('-').map(Number);
  const defaultFrom = new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 10);
  try {
    const rows = await fetchSnapshot(process.env.WINDSOR_API_KEY, process.env.WINDSOR_DATE_FROM || defaultFrom, process.env.WINDSOR_DATE_TO || today);
    console.log(JSON.stringify(await syncReviews(rows, firestoreTransport(process.env.GOOGLE_ACCESS_TOKEN), { apply: true })));
  } catch (error) {
    // Only our sanitized errors; do not print upstream response bodies or credentials.
    console.error(error instanceof Error ? error.message : 'Sync failed');
    process.exitCode = 1;
  }
}
