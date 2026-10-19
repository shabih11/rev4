export { normalizeWindsorReviews, stripReviewTranslation } from './windsorReviewModel.mjs';
export const WINDSOR_REVIEW_FIELDS = 'account_id,location_title,review_id,review_reviewer,review_star_rating,review_comment,review_create_time';
export const WINDSOR_API_EXAMPLE = `https://connectors.windsor.ai/google_my_business?api_key=YOUR_API_KEY&date_preset=this_monthT&fields=${WINDSOR_REVIEW_FIELDS}`;
export async function fetchReviewsFromWindsor(apiUrl: string): Promise<unknown[]> {
  let url: URL;
  try { url = new URL(apiUrl.trim()); } catch { throw new Error('أدخل رابط API صحيحًا من Windsor.ai'); }
  if (url.protocol !== 'https:' || url.hostname !== 'connectors.windsor.ai' || url.pathname.replace(/\/$/, '') !== '/google_my_business') {
    throw new Error('استخدم رابط https://connectors.windsor.ai/google_my_business');
  }
  if (!url.searchParams.get('api_key')) throw new Error('رابط Windsor.ai يفتقد مفتاح API');
  url.searchParams.set('fields', WINDSOR_REVIEW_FIELDS);
  if (!url.searchParams.has('date_preset') && !url.searchParams.has('date_from')) url.searchParams.set('date_preset', 'this_monthT');
  let response: Response;
  try { response = await fetch(url.toString(), { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(30000) }); }
  catch { throw new Error('تعذر الاتصال بـ Windsor.ai؛ تحقق من الاتصال وإتاحة الطلبات من المتصفح'); }
  if (!response.ok) throw new Error(`فشل الاتصال بـ Windsor.ai (رمز ${response.status})`);
  let payload: unknown;
  try { payload = await response.json(); } catch { throw new Error('استجابة Windsor.ai ليست JSON صحيحًا'); }
  const rows = Array.isArray(payload) ? payload : payload && typeof payload === 'object' && 'data' in payload ? (payload as { data: unknown }).data : null;
  if (!Array.isArray(rows)) throw new Error('استجابة Windsor.ai لا تحتوي على بيانات التقييمات');
  return rows;
}
