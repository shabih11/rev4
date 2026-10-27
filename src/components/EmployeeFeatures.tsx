import { TrendingUp } from 'lucide-react';
import { useData } from '../context/DataContext';
import { dailyProgress, employeeTier } from '../lib/employeeFeatures';
import type { UserAccount } from '../lib/mockData';
import { TierAward } from './TierAward';
import { AvatarImage } from './AvatarImage';
export function TierBadge({ employee }: { employee: UserAccount }) {
  const { features } = useData();
  const tier = features ? employeeTier(employee.points, features.settings) : 'bronze';
  if (tier === 'bronze' || employee.role !== 'employee') return null;
  return <TierAward gold={tier === 'gold'} />;
}
export function BalanceGrowth({ employee }: { employee: UserAccount }) {
  const { features, users } = useData();
  const { growth } = dailyProgress(employee, users.filter(user => user.role === 'employee'), features);
  if (!features?.settings.balanceGrowth || growth <= 0) return null;
  return <span dir="ltr" className="balance-growth" title="زيادة الرصيد في آخر تحديث يومي">(+{growth.toFixed(1)})</span>;
}
export function Overtaken({ employee }: { employee: UserAccount }) {
  const { features, users } = useData();
  const { rankGain, overtaken } = dailyProgress(employee, users.filter(user => user.role === 'employee'), features);
  if (!features?.settings.competition || rankGain <= 0) return null;
  return <div className="rank-progress"><span className="rank-gain" aria-label={`تقدمت ${rankGain} مراكز في آخر تحديث يومي`}><TrendingUp size={20} aria-hidden="true" /><b dir="ltr">+{rankGain}</b></span>{overtaken.length > 0 && <p className="overtaken-note">تجاوزت {overtaken.join(' و')}</p>}</div>;
}
export function EmployeeAvatar({ employee, className = '' }: { employee: UserAccount; className?: string }) {
  const { features } = useData();
  const path = features?.settings.avatars ? features.store?.equipped[employee.id] || null : null;
  return <span className={`employee-avatar ${className}`}><AvatarImage path={path} alt={employee.name} className="h-full w-full object-contain" /></span>;
}
