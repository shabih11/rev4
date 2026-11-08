import type { ReviewSummary } from '../context/DataContext';
import { riyadhDateKey, toEnglishNumerals } from './formatDate';

export interface EmployeeMission {
  id: string; title: string; description: string; hint: string; effort: string;
  period: 'daily' | 'monthly'; current: number; target: number; stars: number;
}

// Cost of the next transition, rather than the cumulative total since level 1.
export function levelCost(level: number): number {
  if (!Number.isInteger(level) || level < 1) throw new RangeError('Invalid level');
  let cost = 5;
  for (let current = 1; current < level; current++) cost = current < 9 ? cost * 2 : Math.ceil(cost * 1.3);
  return cost;
}

export function employeeLevel(stars: number) {
  let remaining = Number.isFinite(stars) ? Math.max(0, stars) : 0;
  let level = 1, required = 5, spent = 0;
  while (remaining + 1e-9 >= required) {
    remaining = Math.max(0, remaining - required);
    spent += required;
    required = level < 9 ? required * 2 : Math.ceil(required * 1.3);
    level++;
  }
  return { level, current: remaining, required, remaining: required - remaining, spent };
}

function calendarDay(date: string) {
  const parts = toEnglishNumerals(date).replace(/\//g, '-').split('-');
  if (parts.length !== 3) return '';
  const [day, month, year] = (parts[0].length === 4 ? [...parts].reverse() : parts).map(Number);
  if (year < 1000) return '';
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() + 1 === month && parsed.getUTCDate() === day
    ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` : '';
}

type ImportedRating = { id: string; day: string; rating: number; members: string[] };
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

function periodMissions(employeeId: string, rows: ImportedRating[], today: string): EmployeeMission[] {
  const positive = rows.filter(row => row.rating >= 4);
  const daily = positive.filter(row => row.day === today);
  const partners = new Map<string, number>();
  for (const row of positive) for (const id of row.members) {
    if (id !== employeeId) partners.set(id, (partners.get(id) || 0) + 1);
  }
  const missions: EmployeeMission[] = [
    { id: 'daily-two', title: 'أثران في يوم واحد', description: 'اكتسبي تقييمين إيجابيين اليوم.', hint: 'تقييمان مستوردان بتقدير 4 أو 5 نجوم مرتبطان باسمك في اليوم نفسه. تتجدد المكافأة يوميًا.', effort: 'مجهود قصير: تجربتان ناجحتان في يوم واحد', period: 'daily', current: Math.min(daily.length, 2), target: 2, stars: 1 },
    { id: 'partner', title: 'ثنائي متألق', description: 'اكتسبي تقييمين إيجابيين مع الشريكة نفسها هذا الشهر.', hint: 'يلزم وجود اسمك واسم الزميلة نفسها في تقييمين مختلفين. تقدير المجهود أعلى لأنه يحتاج تنسيقًا متكررًا. تُمنح المكافأة مرة في الشهر.', effort: 'مجهود متوسط: تعاون متكرر مع الشريكة نفسها', period: 'monthly', current: Math.min(Math.max(0, ...partners.values()), 2), target: 2, stars: 3 },
    { id: 'ten', title: 'عشرة آثار جميلة', description: 'اجمعي 10 تقييمات إيجابية هذا الشهر.', hint: 'كل تقييم مستورد مختلف مرتبط باسمك يُحتسب مرة واحدة، سواء كان فرديًا أو مشتركًا. المكافأة مرة في الشهر.', effort: 'مجهود مرتفع: عشر تجارب ناجحة', period: 'monthly', current: Math.min(positive.length, 10), target: 10, stars: 10 },
    { id: 'days', title: 'تألق مستمر', description: 'اكتسبي تقييمًا إيجابيًا في 5 أيام مختلفة هذا الشهر.', hint: 'لا يلزم أن تكون الأيام متتالية؛ أيام الراحة لا تقطع التقدم. المكافأة مرة في الشهر.', effort: 'مجهود مرتفع: استمرارية على خمسة أيام عمل', period: 'monthly', current: Math.min(new Set(positive.map(row => row.day)).size, 5), target: 5, stars: 8 },
    { id: 'partners', title: 'جسر الفريق', description: 'اكتسبي تقييمات إيجابية مشتركة مع 3 زميلات مختلفات هذا الشهر.', hint: 'يُحتسب عدد الزميلات المختلفات في التقييمات المشتركة المرتبطة باسمك. المكافأة مرة في الشهر.', effort: 'مجهود متوسط: تعاون مع ثلاث زميلات', period: 'monthly', current: Math.min(partners.size, 3), target: 3, stars: 6 },
  ];
  const negative = rows.filter(row => row.rating <= 2).sort((a, b) => a.day.localeCompare(b.day) || a.id.localeCompare(b.id))[0];
  if (negative) {
    // Same rule as employeeMetrics: surplus beyond 20 positive shares × .125
    // restores a negative review's .5 / participants deduction.
    const target = 4 / negative.members.length;
    const surplus = Math.max(0, sum(positive.map(row => 1 / row.members.length)) - 20);
    missions.push({ id: 'recovery', title: 'امحي أثر تقييم سلبي', description: 'عوّضي أثر أول تقييم سلبي لديكِ هذا الشهر.', hint: `بعد أول 20 حصة تقييم إيجابي في الشهر، تحتاجين ${target.toLocaleString('ar-SA', { maximumFractionDigits: 2 })} حصة إضافية لتعويض حصتك من أول تقييم سلبي (نجمة أو نجمتان). التقييم المشترك يُقسّم بالتساوي. يتبع الإنجاز قاعدة التعويض الحالية، ولا يحذف التقييم. المكافأة مرة في الشهر.`, effort: 'مجهود مرتفع: تعويض الجودة بعد بلوغ 20 حصة', period: 'monthly', current: Math.min(surplus, target), target, stars: 8 });
  }
  return missions;
}

export function employeeMissions(employeeId: string, reviews: ReviewSummary[], now = new Date()) {
  const today = riyadhDateKey(now);
  const day = calendarDay(today), month = day.slice(0, 7);
  const seen = new Set<string>();
  const months = new Map<string, ImportedRating[]>();
  let ratingStars = 0;
  for (const review of reviews) {
    const date = calendarDay(review.date);
    const rawRating = toEnglishNumerals(review.rating).trim();
    const members = [...new Set(review.linkedEmployeeIds)].filter(Boolean);
    if (!date || date > day || !/^[1-5]$/.test(rawRating) || !members.includes(employeeId) || seen.has(review.id)) continue;
    seen.add(review.id);
    const row = { id: review.id, day: date, rating: Number(rawRating), members };
    const key = date.slice(0, 7);
    if (!months.has(key)) months.set(key, []);
    months.get(key)!.push(row);
    if (row.rating >= 4) ratingStars += row.rating / members.length;
  }
  let bonusStars = 0;
  // Derive each historical reward once per period; refreshes cannot claim it twice.
  for (const rows of months.values()) {
    bonusStars += sum(periodMissions(employeeId, rows, '').filter(mission => mission.period === 'monthly' && mission.current + 1e-9 >= mission.target).map(mission => mission.stars));
    const dayCounts = new Map<string, number>();
    for (const row of rows) if (row.rating >= 4) dayCounts.set(row.day, (dayCounts.get(row.day) || 0) + 1);
    bonusStars += [...dayCounts.values()].filter(count => count >= 2).length;
  }
  const missions = periodMissions(employeeId, months.get(month) || [], day);
  // Shared thirds and similar fractions must not leave a completed level just short.
  ratingStars = Number(ratingStars.toFixed(9));
  const stars = ratingStars + bonusStars;
  return { today, missions, ratingStars, bonusStars, stars, level: employeeLevel(stars), completed: missions.filter(mission => mission.current + 1e-9 >= mission.target).length };
}
