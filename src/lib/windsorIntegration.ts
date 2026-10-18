import { toEnglishNumerals } from './formatDate';
import type { CustomerReview } from '../context/DataContext';

export const WINDSOR_REVIEW_FIELDS = 'account_id,location_title,review_id,review_reviewer,review_star_rating,review_comment,review_create_time';
export const WINDSOR_API_EXAMPLE = `https://connectors.windsor.ai/google_my_business?api_key=YOUR_API_KEY&date_preset=this_monthT&fields=${WINDSOR_REVIEW_FIELDS}`;
const branches = ['جاليري', 'ذافيو', 'سلام', 'القصر', 'المملكة', 'شرق'];

/**
 * Strips Google Reviews automated translations and returns only the original text written by the customer.
 */
export function stripReviewTranslation(comment?: string): string {
  if (!comment) return '';
  let cleaned = comment.trim();

  // Pattern 1: Translation block followed by an Original block
  // e.g. "(Translated by Google) ... (Original) <original text>"
  // or "(مترجم بواسطة Google) ... (النص الأصلي) <original text>"
  const originalRegex = /\((?:Original|النص الأصلي)\)\s*([\s\S]*)/i;
  const originalMatch = cleaned.match(originalRegex);
  if (originalMatch && originalMatch[1]?.trim()) {
    return originalMatch[1].trim();
  }

  // Pattern 2: Original text followed by a Translated block
  // e.g. "<original text> (Translated by Google) <translation>"
  // or "<original text> (مترجم بواسطة Google) <translation>"
  const translatedMarkerRegex = /\s*(?:\(|\b)(?:Translated by Google|مترجم بواسطة Google|Traduit par Google|Traducido por Google)(?:\)|\b)[\s\S]*/i;
  if (translatedMarkerRegex.test(cleaned)) {
    const stripped = cleaned.replace(translatedMarkerRegex, '').trim();
    if (stripped) return stripped;
  }

  // Pattern 3: Leading "(Translated by Google)" without an "(Original)" block
  cleaned = cleaned.replace(/^\s*(?:\(|\b)(?:Translated by Google|مترجم بواسطة Google)(?:\)|\b)\s*/i, '').trim();

  return cleaned;
}

/** Only import individual reviews with an unambiguous branch, rating and timestamp. */
export function normalizeWindsorReviews(rawData: unknown, mapping: Record<string, string> = {}): Omit<CustomerReview, 'linkedEmployeeIds'>[] {
  const rows = Array.isArray(rawData) ? rawData : rawData && typeof rawData === 'object' && 'data' in rawData ? (rawData as { data: unknown }).data : null;
  if (!Array.isArray(rows)) throw new Error('استجابة Windsor.ai لا تحتوي على مصفوفة data للتقييمات');
  const result: Omit<CustomerReview, 'linkedEmployeeIds'>[] = [];
  const seen = new Set<string>();
  for (const item of rows) {
    if (!item || typeof item !== 'object' || !item.review_id) continue;
    const account = String(item.account_id || item.location_id || '');
    const title = String(item.location_title || '');
    const branch = mapping[account] || branches.find(b => title.includes(b));
    if (!branch || !branches.includes(branch)) throw new Error(`حدد الفرع المقابل لمعرف الموقع ${account || title} في إعدادات Windsor.ai`);
    const namedRatings: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
    const rawRating = toEnglishNumerals(String(item.review_star_rating ?? '')).trim().toUpperCase();
    const rating = namedRatings[rawRating] ?? Number(rawRating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new Error('تقييم Windsor.ai يفتقد قيمة نجوم صحيحة');
    const timestamp = new Date(item.review_create_time);
    if (!item.review_create_time || Number.isNaN(timestamp.getTime())) throw new Error('تقييم Windsor.ai يفتقد تاريخ الإنشاء الصحيح');
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(timestamp);
    const part = (type: string) => parts.find(p => p.type === type)!.value;
    const id = String(item.review_id);
    if (seen.has(id)) continue;
    seen.add(id);
    const cleanComment = stripReviewTranslation(String(item.review_comment || ''));
    result.push({ id, reviewerName: String(item.review_reviewer || 'عميل'), rating: String(rating), comment: cleanComment, date: `${part('day')}-${part('month')}-${part('year')}`, time: `${part('hour')}:${part('minute')}`, branch });
  }
  return result;
}

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
