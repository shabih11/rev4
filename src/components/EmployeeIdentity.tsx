import { employeeBranchLabel, isCoverageEmployee } from '../lib/employeeBranches';
import type { ReactNode } from 'react';
import type { UserAccount } from '../lib/mockData';
import { TierBadge } from './EmployeeFeatures';
export function EmployeeIdentity({ employee, className = '', nameContent, branchContent, showCoverageBranch = false }: { employee: UserAccount; className?: string; nameContent?: ReactNode; branchContent?: ReactNode; showCoverageBranch?: boolean }) {
  return <span className={`employee-identity ${className}`}>
    <span className="employee-identity-line"><span className="employee-identity-name">{nameContent ?? employee.name}</span><span className="employee-identity-branch">{isCoverageEmployee(employee) && !showCoverageBranch ? 'تغطية' : branchContent ?? `(${employeeBranchLabel(employee, showCoverageBranch)})`}</span></span>
    <TierBadge employee={employee}/>
  </span>;
}
