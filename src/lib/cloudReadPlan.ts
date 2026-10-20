export interface RecordScope {
  all?: boolean;
  branches?: string[];
  employeeIds?: string[];
}

export interface RecordDemand {
  users?: boolean;
  reviews?: RecordScope;
  timeline?: RecordScope;
}

export function combineRecordScopes(scopes: (RecordScope | undefined)[]): RecordScope | null {
  if (scopes.some(scope => scope?.all)) return { all: true };
  const branches = [...new Set(scopes.flatMap(scope => scope?.branches || []))].filter(Boolean).sort();
  const employeeIds = [...new Set(scopes.flatMap(scope => scope?.employeeIds || []))].filter(Boolean).sort();
  return branches.length || employeeIds.length ? { branches, employeeIds } : null;
}

export type CloudFilter = { field: string; op: 'in' | 'array-contains-any' | '==' | 'array-contains'; value: string | string[] };

// Null disables loading; an empty request must never become an unbounded query.
export function recordFilters(name: string, scope: RecordScope | null, account: { role: string; id: string; branch: string }): CloudFilter[] | null {
  if (!scope) return null;
  const normalized = combineRecordScopes([scope]);
  if (!normalized) return null;
  if (name === 'timeline' && account.role !== 'admin') {
    return account.role === 'manager'
      ? [{ field: 'branch', op: '==', value: account.branch }]
      : [{ field: 'employeeIds', op: 'array-contains', value: account.id }];
  }
  if (normalized.all) return [];
  const { branches = [], employeeIds = [] } = normalized;
  if (branches.length + employeeIds.length > 30) throw new Error('نطاق الطلب يتجاوز الحد المسموح للاستعلام');
  const filters: CloudFilter[] = [];
  if (branches.length) filters.push({ field: 'branch', op: 'in', value: branches });
  if (employeeIds.length) filters.push({ field: name === 'reviews' ? 'linkedEmployeeIds' : 'employeeIds', op: 'array-contains-any', value: employeeIds });
  return filters;
}
