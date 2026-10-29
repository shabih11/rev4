import type { UserAccount } from './mockData';

export interface ShiftBranchRecord { id: string; branch: string; occurred_at: string; employee_ids: string[] }

export function isCoverageEmployee(employee: Pick<UserAccount, 'branch' | 'isCoverage' | 'assignedBranches'>) {
  return employee.isCoverage === true;
}

export function latestCoverageBranches(rows: ShiftBranchRecord[], employeeIds: string[], now: number) {
  const wanted = new Set(employeeIds);
  const latest = new Map<string, { branch: string; timestamp: number; id: string }>();
  for (const row of rows) {
    const timestamp = Date.parse(row.occurred_at);
    if (!row.branch || !Number.isFinite(timestamp) || timestamp > now) continue;
    for (const id of row.employee_ids) {
      if (!wanted.has(id)) continue;
      const previous = latest.get(id);
      if (!previous || timestamp > previous.timestamp || (timestamp === previous.timestamp && row.id > previous.id)) latest.set(id, { branch: row.branch, timestamp, id: row.id });
    }
  }
  return Object.fromEntries([...latest].map(([id, value]) => [id, value.branch]));
}

export function employeeReviewBranches(reviews: { branch: string; linkedEmployeeIds: string[] }[], employeeId: string) {
  return [...new Set(reviews.filter(review => review.linkedEmployeeIds.includes(employeeId)).map(review => review.branch.trim()).filter(Boolean))];
}

export function belongsToBranch(employee: Pick<UserAccount, 'branch' | 'isCoverage' | 'assignedBranches'>, branch: string) {
  return !isCoverageEmployee(employee) && (employee.branch === branch || Boolean(employee.assignedBranches?.includes(branch)));
}

export function employeeBranchLabel(employee: Pick<UserAccount, 'branch' | 'isCoverage'>, showCoverageBranch = false) {
  return isCoverageEmployee(employee) && !showCoverageBranch ? 'تغطية' : employee.branch;
}

export function leaderboardEmployee<T extends Pick<UserAccount, 'id' | 'branch' | 'isCoverage'>>(employee: T, latestBranches: Record<string, string>): T {
  return isCoverageEmployee(employee) ? { ...employee, branch: latestBranches[employee.id] || 'تغطية' } : employee;
}

export function employeeSelectionBranch(employee?: Pick<UserAccount, 'branch' | 'isCoverage'>) {
  return employee ? isCoverageEmployee(employee) ? 'موظفة خارجية' : employee.branch : '';
}
