import type { ReactNode } from 'react';
import type { UserAccount } from '../lib/mockData';
import { TierBadge } from './EmployeeFeatures';
export function EmployeeIdentity({ employee, className = '', nameContent, branchContent }: { employee: UserAccount; className?: string; nameContent?: ReactNode; branchContent?: ReactNode }) {
  return <span className={`employee-identity ${className}`}>
    <span className="employee-identity-line"><span className="employee-identity-name">{nameContent ?? employee.name}</span><span className="employee-identity-branch">{branchContent ?? `(${employee.branch})`}</span></span>
    <TierBadge employee={employee}/>
  </span>;
}
