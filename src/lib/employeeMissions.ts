import type { ReviewSummary } from '../context/DataContext';
import { riyadhDateKey, toEnglishNumerals } from './formatDate';

export interface EmployeeMission {
  id: string; title: string; description: string; hint: string; effort: string;
  period: 'daily' | 'monthly'; current: number; target: number; stars: number; coins: number;
}

// Fixed launch date: never move this forward when the calendar month changes.
export const PROGRESSION_START = '2026-11-01';
export function levelCost(level: number): number {
  if (!Number.isInteger(level) || level < 1) throw new RangeError('Invalid level');
  return Math.round(50 * 1.25 ** (level - 1) / 5) * 5;
}
export function employeeLevel(stars: number) {
  let remaining = Number.isFinite(stars) ? Math.max(0, stars) : 0;
  let level = 1, spent = 0;
  while (remaining + 1e-9 >= levelCost(level)) {
    const cost = levelCost(level);
    remaining = Math.max(0, remaining - cost); spent += cost; level++;
  }
  const required = levelCost(level);
  return { level, current: remaining, required, remaining: required - remaining, spent };
}
export const missionBand = (level: number) => Math.min(3, Math.floor((level - 1) / 3));
const targets = { daily: [2, 3, 4, 5], ten: [10, 20, 35, 50], days: [5, 8, 12, 16], partner: [2, 4, 6, 8] };
const rewards = {
  daily: [[5, 5], [10, 10], [15, 15], [20, 20]],
  ten: [[25, 30], [60, 75], [110, 140], [175, 225]],
  days: [[20, 25], [40, 50], [70, 90], [110, 140]],
  partner: [[10, 15], [25, 35], [45, 60], [70, 90]],
  partners: [[15, 20], [25, 35], [40, 55], [60, 80]],
};

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

function periodMissions(employeeId: string, rows: ImportedRating[], today: string, band = 0): EmployeeMission[] {
  const positive = rows.filter(row => row.rating >= 4);
  const daily = positive.filter(row => row.day === today);
  const partners = new Map<string, number>();
  for (const row of positive) for (const id of row.members) {
    if (id !== employeeId) partners.set(id, (partners.get(id) || 0) + 1);
  }
  const reward = (id: keyof typeof rewards) => ({ coins: rewards[id][band][0], stars: rewards[id][band][1] });
  const missions: EmployeeMission[] = [
    { id: 'daily-two', title: 'أثران في يوم واحد', description: `اكتسبي ${targets.daily[band]} تقييمات إيجابية اليوم.`, hint: 'تقييمات مستوردة بتقدير 4 أو 5 نجوم مرتبطة باسمك في اليوم نفسه. تتجدد المكافأة يوميًا.', effort: 'مجهود قصير: تجارب ناجحة في يوم واحد', period: 'daily', current: Math.min(daily.length, targets.daily[band]), target: targets.daily[band], ...reward('daily') },
    { id: 'partner', title: 'ثنائي متألق', description: `اكتسبي ${targets.partner[band]} تقييمات إيجابية مع الشريكة نفسها هذا الشهر.`, hint: 'يلزم تكرار التعاون مع الزميلة نفسها في تقييمات مختلفة. مكافأة واحدة في الشهر.', effort: 'مجهود متوسط: تعاون متكرر مع الشريكة نفسها', period: 'monthly', current: Math.min(Math.max(0, ...partners.values()), targets.partner[band]), target: targets.partner[band], ...reward('partner') },
    { id: 'ten', title: 'حصاد الشهر', description: `اجمعي ${targets.ten[band]} تقييمًا إيجابيًا هذا الشهر.`, hint: 'كل تقييم مستورد مختلف يُحتسب مرة واحدة، فرديًا أو مشتركًا. مكافأة واحدة في الشهر.', effort: 'مجهود مرتفع: حصاد التجارب الناجحة', period: 'monthly', current: Math.min(positive.length, targets.ten[band]), target: targets.ten[band], ...reward('ten') },
    { id: 'days', title: 'تألق مستمر', description: `اكتسبي تقييمًا إيجابيًا في ${targets.days[band]} أيام مختلفة هذا الشهر.`, hint: 'لا يلزم أن تكون الأيام متتالية؛ أيام الراحة لا تقطع التقدم. مكافأة واحدة في الشهر.', effort: 'مجهود مرتفع: الاستمرارية خلال الشهر', period: 'monthly', current: Math.min(new Set(positive.map(row => row.day)).size, targets.days[band]), target: targets.days[band], ...reward('days') },
    { id: 'partners', title: 'جسر الفريق', description: 'اكتسبي تقييمات إيجابية مشتركة مع 3 زميلات مختلفات هذا الشهر.', hint: 'يُحتسب عدد الزميلات المختلفات. مهمة اختيارية بمكافأة واحدة في الشهر.', effort: 'مجهود متوسط: تعاون مع ثلاث زميلات', period: 'monthly', current: Math.min(partners.size, 3), target: 3, ...reward('partners') },
  ];
  const negative = rows.filter(row => row.rating <= 2).sort((a, b) => a.day.localeCompare(b.day) || a.id.localeCompare(b.id))[0];
  if (negative) {
    // Same rule as employeeMetrics: surplus beyond 20 positive shares × .125
    // restores a negative review's .5 / participants deduction.
    const target = 4 / negative.members.length;
    const surplus = Math.max(0, sum(positive.map(row => 1 / row.members.length)) - 20);
    missions.push({ id: 'recovery', title: 'امحي أثر تقييم سلبي', description: 'عوّضي أثر أول تقييم سلبي لديكِ هذا الشهر.', hint: `بعد أول 20 حصة تقييم إيجابي في الشهر، تحتاجين ${target.toLocaleString('ar-SA', { maximumFractionDigits: 2 })} حصة إضافية لتعويض حصتك من أول تقييم سلبي (نجمة أو نجمتان). التقييم المشترك يُقسّم بالتساوي. يتبع الإنجاز قاعدة التعويض الحالية، ولا يحذف التقييم. المكافأة مرة في الشهر.`, effort: 'مجهود مرتفع: تعويض الجودة بعد بلوغ 20 حصة', period: 'monthly', current: Math.min(surplus, target), target, stars: 25, coins: 20 });
  }
  return missions;
}

export function employeeMissions(employeeId: string, reviews: ReviewSummary[], now = new Date()) {
  const today = riyadhDateKey(now);
  const day = calendarDay(today), month = day.slice(0, 7);
  const seen = new Set<string>();
  const months = new Map<string, ImportedRating[]>();
  let ratingStars = 0, ratingCoins = 0;
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
    if (row.rating >= 4) { ratingCoins += 5; if (date >= PROGRESSION_START) ratingStars += 5; }
  }
  let bonusStars = 0, bonusCoins = 0, historicalStars = 0, band = 0;
  const achievements: { id: string; title: string; month: string; band: number }[] = [];
  // Replay months chronologically. Difficulty is fixed from the level at month start.
  for (const key of [...new Set([...months.keys(), month])].sort()) {
    const rows = months.get(key) || [];
    const active = key >= PROGRESSION_START.slice(0, 7);
    const periodBand = active ? missionBand(employeeLevel(historicalStars).level) : 0;
    if (key === month) band = periodBand;
    const monthly = periodMissions(employeeId, rows, '', periodBand).filter(m => m.period === 'monthly' && m.current + 1e-9 >= m.target);
    let monthStars = sum(monthly.map(m => m.stars));
    bonusCoins += sum(monthly.map(m => m.coins));
    const dayCounts = new Map<string, number>();
    for (const row of rows) if (row.rating >= 4) dayCounts.set(row.day, (dayCounts.get(row.day) || 0) + 1);
    const completedDays = [...dayCounts.values()].filter(count => count >= targets.daily[periodBand]).length;
    monthStars += completedDays * rewards.daily[periodBand][1];
    bonusCoins += completedDays * rewards.daily[periodBand][0];
    if (active) {
      bonusStars += monthStars;
      historicalStars += rows.filter(row => row.rating >= 4).length * 5 + monthStars;
      achievements.push(...monthly.map(m => ({ id: m.id, title: m.title, month: key, band: periodBand })));
      if (completedDays) achievements.push({ id: 'daily-two', title: 'أثران في يوم واحد', month: key, band: periodBand });
    }
  }
  const missions = day >= PROGRESSION_START ? periodMissions(employeeId, months.get(month) || [], day, band) : [];
  const stars = ratingStars + bonusStars;
  return { today, missions, ratingStars, bonusStars, stars, ratingCoins, bonusCoins, coins: ratingCoins + bonusCoins, achievements, band, level: employeeLevel(stars), completed: missions.filter(mission => mission.current + 1e-9 >= mission.target).length };
}
