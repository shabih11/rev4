import type { Employee } from '../types';

export type Role = 'manager' | 'employee' | 'admin' | 'viewer';

export interface UserAccount extends Employee {
  email: string;
  mustChangePassword?: boolean;
  role: Role;
}

export function normalizeArabicName(str: string): string {
  if (!str) return '';
  return str
    .trim()
    .replace(/[أإآء]/g, 'ا')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[ـ\s]+/g, ' ')
    .toLowerCase();
}

export function matchEmployee(
  users: UserAccount[],
  branch: string,
  rawName: string
): UserAccount | undefined {
  if (!rawName) return undefined;

  const cleanedName = rawName
    .replace(/[([（]?(?:تغطية|تغطيه)[)）]?/gi, '')
    .trim();

  if (!cleanedName) return undefined;

  const normClean = normalizeArabicName(cleanedName);
  const upperCode = cleanedName.toUpperCase();

  // 1. Direct or code/alias match in current branch or coverage
  const candidateUsers = users.filter(
    u => u.role === 'employee' && (u.branch === branch || u.isCoverage === true)
  );

  let found = candidateUsers.find(
    u => u.id === cleanedName ||
         (u.code && u.code.toUpperCase() === upperCode) ||
         u.name === cleanedName ||
         u.name === `الموظفة ${cleanedName}`
  );
  if (found) return found;

  found = candidateUsers.find(
    u => normalizeArabicName(u.name) === normClean ||
         normalizeArabicName(u.name) === normalizeArabicName(`الموظفة ${cleanedName}`)
  );
  if (found) return found;

  found = candidateUsers.find(u =>
    u.aliases?.some(alias => normalizeArabicName(alias) === normClean || alias.toUpperCase() === upperCode)
  );
  if (found) return found;

  // 2. Global fallback across all users
  found = users.find(
    u => u.role === 'employee' && (
      u.id === cleanedName ||
      (u.code && u.code.toUpperCase() === upperCode) ||
      u.name === cleanedName ||
      normalizeArabicName(u.name) === normClean ||
      u.aliases?.some(alias => normalizeArabicName(alias) === normClean || alias.toUpperCase() === upperCode)
    )
  );

  return found;
}

