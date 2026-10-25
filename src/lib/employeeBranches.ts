import type { UserAccount } from './mockData';

export interface ShiftBranchRecord { id: string; branch: string; occurred_at: string; employee_ids: string[] }

export function isCoverageEmployee(employee: Pick<UserAccount, 'branch' | 'isCoverage' | 'assignedBranches'>) {
  return employee.isCoverage ?? (employee.branch === 'موظفة خارجية' || Boolean(employee.assignedBranches?.some(branch => branch !== employee.branch)));
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
  return employee.branch === branch || (!isCoverageEmployee(employee) && Boolean(employee.assignedBranches?.includes(branch)));
}
