// Shared with the shift-entry screen: these are branch openings, not shift boundaries.
export const BRANCH_HOURS: Record<string, { open: string; nextDay: string; label: string }> = {
  'جاليري': { open: '14:00', nextDay: '14:00', label: 'الرياض جاليري (2 مساءً)' },
  'الرياض جاليري': { open: '14:00', nextDay: '14:00', label: 'الرياض جاليري (2 مساءً)' },
  'القصر': { open: '14:00', nextDay: '14:00', label: 'القصر مول (2 مساءً)' },
  'القصر مول': { open: '14:00', nextDay: '14:00', label: 'القصر مول (2 مساءً)' },
  'المملكة': { open: '10:00', nextDay: '10:00', label: 'المملكة (10 صباحاً)' },
  'شرق': { open: '07:00', nextDay: '07:00', label: 'شرق بلازا (7 صباحاً)' },
  'شرق بلازا': { open: '07:00', nextDay: '07:00', label: 'شرق بلازا (7 صباحاً)' },
  'ذافيو': { open: '12:00', nextDay: '12:00', label: 'ذافيو (12 مساءً)' },
  'سلام': { open: '10:00', nextDay: '10:00', label: 'سلام (10 صباحاً)' },
};

export function getBranchHours(branchName?: string) {
  if (branchName) {
    for (const [key, value] of Object.entries(BRANCH_HOURS)) {
      if (branchName.includes(key) || key.includes(branchName)) return value;
    }
  }
  return { open: '14:00', nextDay: '14:00', label: '2 مساءً' };
}
