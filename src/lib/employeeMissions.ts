import type { ReviewSummary } from '../context/DataContext';
import { riyadhDateKey, timeMinutes, toEnglishNumerals } from './formatDate';

export interface EmployeeMission {
  id: string; title: string; description: string; hint: string; effort: string;
  band?: number; completedBands?: number;
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

type ImportedRating = { id: string; day: string; time: number; rating: number; members: string[] };
type MissionAchievement = { id: string; title: string; month: string; band: number };
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

export const missionGrades = ['الخضراء', 'الزرقاء', 'الذهبية'] as const;
export const gradeReward = (base: number, band: number) => Math.round(base * 2.25 ** band * 100) / 100;
// New daily first-grade reward applies from this update; prior earnings stay intact.
export const dailyRewardStart = '2026-11-12';
const missionReward = (base: number, band: number, id: string, day: string, kind: 'stars' | 'coins') =>
  id === 'daily-two' && band === 0 && day >= dailyRewardStart ? (kind === 'stars' ? 13 : 15)
    : gradeReward(id === 'partner' && day >= dailyRewardStart ? (kind === 'stars' ? 98 : 88) : base, band);

const gradeTargets: Record<string, number[]> = {
  'daily-two': [2, 3, 5], partner: [2, 4, 6], ten: [10, 20, 35],
  days: [5, 8, 12], partners: [3, 4, 5],
};
const dailyTitles = ['أثران في يوم واحد', 'ثلاثة آثار في يوم واحد', 'خمسة آثار في يوم واحد'];

function gradedMissions(employeeId: string, rows: ImportedRating[], today: string, asOf = today): EmployeeMission[] {
  // Recompute uncapped counts before choosing the next unfinished grade.
  const positive = rows.filter(row => row.rating >= 4);
  const partners = new Map<string, number>();
  for (const row of positive) for (const id of row.members) {
    if (id !== employeeId) partners.set(id, (partners.get(id) ?? 0) + 1);
  }
  const counts: Record<string, number> = {
    'daily-two': positive.filter(row => row.day === today).length,
    partner: Math.max(0, ...partners.values()), ten: positive.length,
    days: new Set(positive.map(row => row.day)).size, partners: partners.size,
    recovery: Math.max(0, sum(positive.map(row => 1 / row.members.length)) - 20),
  };
  return periodMissions(employeeId, rows, today).map(base => {
    const thresholds = base.id === 'partner' && asOf >= dailyRewardStart ? [10, 20, 30] : gradeTargets[base.id] ?? [base.target, base.target * 1.5, base.target * 2.5];
    const current = counts[base.id];
    const completedBands = thresholds.filter(target => current + 1e-9 >= target).length;
    const band = Math.min(2, completedBands);
    const target = thresholds[band];
    const descriptions: Record<string, string> = {
      'daily-two': `اكتسبي ${target} تقييمات إيجابية اليوم.`,
      partner: `اكتسبي ${target} تقييمات إيجابية مع الشريكة نفسها هذا الشهر.`,
      ten: `اجمعي ${target} تقييمًا إيجابيًا هذا الشهر.`,
      days: `اكتسبي تقييمًا إيجابيًا في ${target} أيام مختلفة هذا الشهر.`,
      partners: `تعاوني مع ${target} زميلات مختلفات هذا الشهر.`,
      recovery: `اجمعي ${target} حصة إيجابية إضافية بعد أول 20 حصة هذا الشهر.`,
    };
    return { ...base, title: base.id === 'daily-two' ? dailyTitles[band] : base.title,
      description: descriptions[base.id], hint: 'ثلاث درجات تتجدد مع بداية الشهر، والتحدي اليومي يتجدد يوميًا. مكافأة مستقلة لكل درجة بزيادة 125٪ عن السابقة.',
      band, completedBands, target, current: Math.min(current, target),
      stars: missionReward(base.stars, band, base.id, base.id === 'partner' ? asOf : today, 'stars'), coins: missionReward(base.coins, band, base.id, base.id === 'partner' ? asOf : today, 'coins') };
  });
}

function importedRatings(employeeId: string, reviews: ReviewSummary[], cutoff: string) {
  const records = new Map<string, ImportedRating>();
  for (const review of reviews) {
    const day = calendarDay(review.date);
    const rating = toEnglishNumerals(review.rating).trim();
    const members = [...new Set(review.linkedEmployeeIds)].filter(Boolean);
    if (!day || day > cutoff || !/^[1-5]$/.test(rating) || !members.includes(employeeId) || records.has(review.id)) continue;
    records.set(review.id, { id: review.id, day, time: timeMinutes(review.time) ?? 0, rating: Number(rating), members });
  }
  return [...records.values()];
}

export function employeeAchievementEvidence(employeeId: string, reviews: ReviewSummary[], achievement: MissionAchievement, today: string) {
  const rows = importedRatings(employeeId, reviews, calendarDay(today))
    .filter(row => row.day.startsWith(achievement.month))
    .sort((a, b) => a.day.localeCompare(b.day) || a.time - b.time || a.id.localeCompare(b.id));

  if (achievement.id === 'daily-two') {
    const byDay = new Map<string, number>();
    let completed: ImportedRating | undefined;
    for (const row of rows) {
      if (row.rating < 4) continue;
      const count = (byDay.get(row.day) ?? 0) + 1;
      byDay.set(row.day, count);
      if (count === (gradeTargets['daily-two'][achievement.band])) completed = row;
    }
    return completed;
  }

  // The first qualifying prefix identifies the review that completed the mission.
  let low = 0, high = rows.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const throughReview = rows.slice(0, middle + 1);
    const missions = gradedMissions(employeeId, throughReview, '', calendarDay(today));
    const mission = missions.find(item => item.id === achievement.id);
    if (mission && (mission.completedBands ?? 0) > achievement.band) high = middle;
    else low = middle + 1;
  }
  return rows[low];
}

export function employeeMissions(employeeId: string, reviews: ReviewSummary[], now = new Date()) {
  const today = riyadhDateKey(now);
  const day = calendarDay(today), month = day.slice(0, 7);
  const months = new Map<string, ImportedRating[]>();
  let ratingStars = 0, ratingCoins = 0;
  for (const row of importedRatings(employeeId, reviews, day)) {
    const key = row.day.slice(0, 7);
    if (!months.has(key)) months.set(key, []);
    months.get(key)!.push(row);
    if (row.rating >= 4) { ratingCoins += 5; if (row.day >= PROGRESSION_START) ratingStars += 5; }
  }
  let bonusStars = 0, bonusCoins = 0;
  const achievements: MissionAchievement[] = [];
  for (const [key, rows] of [...months].sort(([a], [b]) => a.localeCompare(b))) {
    const active = key >= PROGRESSION_START.slice(0, 7);
    if (!active) {
      const completed = periodMissions(employeeId, rows, '').filter(m => m.period === 'monthly' && m.current >= m.target);
      bonusCoins += sum(completed.map(m => m.coins));
      const days = new Map<string, number>();
      for (const row of rows) if (row.rating >= 4) days.set(row.day, (days.get(row.day) ?? 0) + 1);
      bonusCoins += [...days.values()].filter(count => count >= 2).length * 5;
      continue;
    }
    const periods = ['', ...new Set(rows.map(row => row.day))];
    for (const date of periods) {
      for (const mission of gradedMissions(employeeId, rows, date, day).filter(m => date ? m.period === 'daily' : m.period === 'monthly')) {
        const base = periodMissions(employeeId, rows, date).find(m => m.id === mission.id)!;
        for (let band = 0; band < (mission.completedBands ?? 0); band++) {
          bonusStars += missionReward(base.stars, band, base.id, base.id === 'partner' ? day : date, 'stars');
          bonusCoins += missionReward(base.coins, band, base.id, base.id === 'partner' ? day : date, 'coins');
          achievements.push({ id: mission.id, title: mission.id === 'daily-two' ? dailyTitles[band] : mission.title, month: key, band });
        }
      }
    }
  }
  const currentRows = months.get(month) || [];
  const missions = day >= PROGRESSION_START ? gradedMissions(employeeId, currentRows, day) : [];
  const band = Math.max(0, ...missions.map(m => m.band ?? 0));
  bonusStars = Math.round(bonusStars * 100) / 100;
  bonusCoins = Math.round(bonusCoins * 100) / 100;
  const stars = ratingStars + bonusStars;
  return { today, missions, ratingStars, bonusStars, stars, ratingCoins, bonusCoins, coins: ratingCoins + bonusCoins, achievements, band, level: employeeLevel(stars), completed: missions.filter(mission => mission.current + 1e-9 >= mission.target).length };
}
