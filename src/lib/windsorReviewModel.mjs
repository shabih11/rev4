const toEnglishNumerals = s => s.replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x6f0));
const branches = ['جاليري', 'ذافيو', 'سلام', 'القصر', 'المملكة', 'شرق'];
/**
 * Strips Google Reviews automated translations and returns only the original text written by the customer.
 */
export function stripReviewTranslation(comment) {
    if (!comment)
        return '';
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
        if (stripped)
            return stripped;
    }
    // Pattern 3: Leading "(Translated by Google)" without an "(Original)" block
    cleaned = cleaned.replace(/^\s*(?:\(|\b)(?:Translated by Google|مترجم بواسطة Google)(?:\)|\b)\s*/i, '').trim();
    return cleaned;
}
/** Only import individual reviews with an unambiguous branch, rating and timestamp. */
export function normalizeWindsorReviews(rawData, mapping = {}) {
    const rows = Array.isArray(rawData) ? rawData : rawData && typeof rawData === 'object' && 'data' in rawData ? rawData.data : null;
    if (!Array.isArray(rows))
        throw new Error('استجابة Windsor.ai لا تحتوي على مصفوفة data للتقييمات');
    const result = [];
    const seen = new Set();
    for (const item of rows) {
        if (!item || typeof item !== 'object' || !item.review_id)
            continue;
        const account = String(item.account_id || item.location_id || '');
        const title = String(item.location_title || '');
        const branch = mapping[account] || branches.find(b => title.includes(b));
        if (!branch || !branches.includes(branch))
            throw new Error(`حدد الفرع المقابل لمعرف الموقع ${account || title} في إعدادات Windsor.ai`);
        const namedRatings = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
        const rawRating = toEnglishNumerals(String(item.review_star_rating ?? '')).trim().toUpperCase();
        const rating = namedRatings[rawRating] ?? Number(rawRating);
        if (!Number.isInteger(rating) || rating < 1 || rating > 5)
            throw new Error('تقييم Windsor.ai يفتقد قيمة نجوم صحيحة');
        const timestamp = new Date(item.review_create_time);
        if (!item.review_create_time || Number.isNaN(timestamp.getTime()))
            throw new Error('تقييم Windsor.ai يفتقد تاريخ الإنشاء الصحيح');
        const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(timestamp);
        const part = (type) => parts.find(p => p.type === type).value;
        const id = String(item.review_id);
        if (seen.has(id))
            continue;
        seen.add(id);
        const cleanComment = stripReviewTranslation(String(item.review_comment || ''));
        result.push({ id, reviewerName: String(item.review_reviewer || 'عميل'), rating: String(rating), comment: cleanComment, date: `${part('day')}-${part('month')}-${part('year')}`, time: `${part('hour')}:${part('minute')}`, branch });
    }
    return result;
}
