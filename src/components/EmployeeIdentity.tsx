import { employeeBranchLabel, isCoverageEmployee } from '../lib/employeeBranches';
import type { ReactNode } from 'react';
import type { UserAccount } from '../lib/mockData';
import { MonthlyWinnerBadge } from './MonthlyWinnerBadge';
import { TierBadge } from './EmployeeFeatures';
export function EmployeeIdentity({ employee, className = '', nameContent, branchContent, nameAside, hideWinnerBadge = false, hideTierBadge = false, showCoverageBranch = false }: { employee: UserAccount; className?: string; nameContent?: ReactNode; branchContent?: ReactNode; nameAside?: ReactNode; hideWinnerBadge?: boolean; hideTierBadge?: boolean; showCoverageBranch?: boolean }) {
  return <span className={`employee-identity ${className}`}>
    <span className="employee-identity-line"><span className="employee-identity-person"><span className="employee-identity-name">{nameContent ?? employee.name}</span><span className="employee-identity-branch">{isCoverageEmployee(employee) && !showCoverageBranch ? 'موظفة متنقلة' : branchContent ?? `(${employeeBranchLabel(employee, showCoverageBranch)})`}</span></span>{nameAside && <span className="employee-identity-aside">{nameAside}</span>}</span>
    <span className="employee-identity-badges">{!hideTierBadge && <TierBadge employee={employee}/>}{!hideWinnerBadge && employee.previousMonthWinner && <MonthlyWinnerBadge />}</span>
  </span>;
}
