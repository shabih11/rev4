import { Gem } from 'lucide-react';
import { useData } from '../context/DataContext';
import { dailyProgress, employeeTier, allowedAccessories } from '../lib/employeeFeatures';
import type { UserAccount } from '../lib/mockData';
import employeeImg from '../assets/employee.png';

export function TierBadge({ employee }: { employee: UserAccount }) {
  const { features } = useData();
  const tier = features ? employeeTier(employee.points, features.settings) : 'bronze';
  if (tier === 'bronze' || employee.role !== 'employee') return null;
  return <span className={`tier-badge tier-badge-${tier}`} title={tier === 'gold' ? 'الفئة الذهبية' : 'الفئة الفضية'}><Gem size={17} aria-hidden="true" /><span className="sr-only">{tier === 'gold' ? 'الفئة الذهبية' : 'الفئة الفضية'}</span></span>;
}
export function BalanceGrowth({ employee }: { employee: UserAccount }) {
  const { features, users } = useData();
  const { growth } = dailyProgress(employee, users, features);
  if (!features?.settings.balanceGrowth || growth <= 0) return null;
  return <span dir="ltr" className="balance-growth" title="زيادة الرصيد منذ نهاية أمس بتوقيت الرياض">(+{growth.toFixed(1)})</span>;
}
export function Overtaken({ employee }: { employee: UserAccount }) {
  const { features, users } = useData();
  const { overtaken } = dailyProgress(employee, users, features);
  if (!features?.settings.competition || !overtaken.length) return null;
  return <p className="overtaken-note">تجاوزت {overtaken.join(' و')}<span className="sr-only"> منذ نهاية أمس بتوقيت الرياض</span></p>;
}
export function EmployeeAvatar({ employee, className = '' }: { employee: UserAccount; className?: string }) {
  const { features } = useData();
  const tier = features ? employeeTier(employee.points, features.settings) : 'bronze';
  const accessories = features?.settings.avatars ? (features.accessories[employee.id] || []).filter(item => allowedAccessories(tier).includes(item)) : [];
  return <span className={`employee-avatar ${className}`}>
    <img src={employeeImg} alt={employee.name} className="h-full w-full object-contain" />
    {accessories.length > 0 && <svg viewBox="0 0 100 150" preserveAspectRatio="xMidYMid meet" className={`avatar-accessories accessory-${tier}`} aria-label="إكسسوارات الأفتار">
      {accessories.includes('shawl') && <path d="M37 28 Q49 38 65 28 L70 34 Q50 46 34 34 Z" className="avatar-fabric" />}
      {accessories.includes('veil') && <path d="M45 16 Q50 18 55 16 L54 23 Q50 24 46 23 Z" className="avatar-veil" />}
      {accessories.includes('brooch') && <g transform="translate(60 42)"><path d="M0 -1.5 L1.5 0 L0 2 L-1.5 0Z" className="avatar-jewel"/><circle r=".5" fill="white" /></g>}
    </svg>}
  </span>;
}
