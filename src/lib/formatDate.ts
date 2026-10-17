export const toEnglishNumerals = (str: string | number): string => {
  if (str === null || str === undefined) return '';
  const arabicNumbers = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  return String(str).split('').map(c => {
    const idx = arabicNumbers.indexOf(c);
    if (idx !== -1) return idx.toString();
    const persian = '۰۱۲۳۴۵۶۷۸۹'.indexOf(c);
    return persian !== -1 ? String(persian) : c;
  }).join('');
};

const monthNames = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const arabicDigits = (value: string | number) => String(value).replace(/\d/g, digit => '٠١٢٣٤٥٦٧٨٩'[Number(digit)]);

export const formatDate = (dateStr?: string): string => {
  if (!dateStr) return '';
  const parts = toEnglishNumerals(dateStr).replace(/\//g, '-').split('-').map(Number);
  const [day, month] = parts[0] > 31 ? [parts[2], parts[1]] : parts;
  return day > 0 && day <= 31 && month >= 1 && month <= 12 ? `${day} ${monthNames[month - 1]}` : dateStr;
};

export const timeMinutes = (timeStr?: string): number | null => {
  const value = toEnglishNumerals(timeStr || '').trim();
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM|ص|م)?$/i.exec(value);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const period = match[3]?.toUpperCase();
  if (hour === 24 && minute === 0 && !period) hour = 0;
  if (minute > 59 || (period ? hour < 1 || hour > 12 : hour > 23)) return null;
  if (period) hour = hour % 12 + (period === 'PM' || period === 'م' ? 12 : 0);
  return hour * 60 + minute;
};
export const formatTime = (timeStr?: string): string => {
  const minutes = timeMinutes(timeStr);
  if (minutes === null) return timeStr || '';
  const hour = Math.floor(minutes / 60);
  return `${arabicDigits(hour % 12 || 12)}:${arabicDigits(String(minutes % 60).padStart(2, '0'))} ${hour >= 12 ? 'م' : 'ص'}`;
};
export const shiftName = (start?: string): string => {
  const minutes = timeMinutes(start);
  return minutes === null ? 'الشفت' : minutes >= 16 * 60 ? 'الشفت الثاني' : 'الشفت الأول';
};
export const formatDateTime = (dateStr: string, timeStr: string): string => [formatDate(dateStr), formatTime(timeStr)].filter(Boolean).join('، ');
export const riyadhDateKey = (now = new Date()) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Riyadh', day: '2-digit', month: '2-digit', year: 'numeric' }).format(now).replace(/\//g, '-');
export const formatTimestamp = (timestamp: number) => {
  const date = new Date(timestamp);
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Riyadh', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
  return formatDateTime(riyadhDateKey(date), time);
};

export const parseDateStr = (dateStr: string): Date | null => {
  try {
    const [day, month, year] = dateStr.split('-');
    if (!day || !month || !year) return null;
    return new Date(parseInt(toEnglishNumerals(year), 10), parseInt(toEnglishNumerals(month), 10) - 1, parseInt(toEnglishNumerals(day), 10));
  } catch {
    return null;
  }
};

export const isWithinLastDays = (dateStr: string, days: number): boolean => {
  const date = parseDateStr(dateStr);
  if (!date) return false;
  
  // Use current date for the app context, or a fixed reference if testing
  const now = new Date();
  
  const diffTime = Math.abs(now.getTime() - date.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays <= days;
};
