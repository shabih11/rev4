import { toEnglishNumerals } from './formatDate';
import type { CustomerReview } from '../context/DataContext';

export interface MakeReviewRawPayload {
  id?: string;
  reviewerName?: string;
  name?: string;
  author_name?: string;
  rating?: number | string;
  stars?: number | string;
  comment?: string;
  text?: string;
  review?: string;
  date?: string;
  time?: string;
  timestamp?: string | number;
  branch?: string;
  branchName?: string;
}

/**
 * Normalizes raw payload items from Make.com (e.g., Google Maps, WhatsApp, Webhooks)
 * into standard CustomerReview objects expected by the system.
 */
export function normalizeMakeReviews(rawData: any, defaultBranch: string = 'جاليري'): Omit<CustomerReview, 'linkedEmployeeIds'>[] {
  let items: any[] = [];
  
  if (Array.isArray(rawData)) {
    items = rawData;
  } else if (rawData && typeof rawData === 'object') {
    if (Array.isArray(rawData.reviews)) {
      items = rawData.reviews;
    } else if (Array.isArray(rawData.data)) {
      items = rawData.data;
    } else {
      items = [rawData];
    }
  }

  const normalized: Omit<CustomerReview, 'linkedEmployeeIds'>[] = [];

  const now = new Date();
  const defaultDate = `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`;
  const defaultTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  items.forEach((item, index) => {
    if (!item || typeof item !== 'object') return;

    const reviewerName = item.reviewerName || item.name || item.author_name || 'عميل';
    
    let rawRating = item.rating ?? item.stars ?? 5;
    if (typeof rawRating === 'string') {
      rawRating = parseInt(toEnglishNumerals(rawRating), 10) || 5;
    }
    const rating = Math.min(Math.max(Number(rawRating) || 5, 1), 5).toString();

    const comment = item.comment || item.text || item.review || '';
    
    let date = item.date ? toEnglishNumerals(String(item.date)).replace(/\//g, '-') : defaultDate;
    let time = item.time ? toEnglishNumerals(String(item.time)) : defaultTime;

    if (item.timestamp) {
      try {
        const d = new Date(typeof item.timestamp === 'number' ? item.timestamp : item.timestamp);
        if (!isNaN(d.getTime())) {
          date = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
          time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        }
      } catch {
        // Fallback to default date/time
      }
    }

    const branch = item.branch || item.branchName || defaultBranch;

    normalized.push({
      id: item.id || `make_${Date.now()}_${index}`,
      reviewerName,
      rating,
      comment,
      date,
      time,
      branch
    });
  });

  return normalized;
}

/**
 * Fetches reviews array from Make.com Custom Webhook URL
 */
export async function fetchReviewsFromMake(webhookUrl: string): Promise<any> {
  if (!webhookUrl || !webhookUrl.trim()) {
    throw new Error('رابط Webhook لـ Make.com غير مدخل');
  }

  const cleanUrl = webhookUrl.trim();
  const response = await fetch(cleanUrl, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`فشل الاتصال بـ Make.com (كود الاستجابة: ${response.status})`);
  }

  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('البيانات المرجعة من Make.com ليست بصيغة JSON صحيحة');
  }
}
