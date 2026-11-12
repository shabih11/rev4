import { employeeTier } from '../lib/employeeFeatures';
import { useData } from '../context/DataContext';
import { employeeLevel, employeeMissions } from '../lib/employeeMissions';

export function LevelStar({ level, gold = false, silver = false }: { level: number; gold?: boolean; silver?: boolean }) {
  const label = String(level);
  return <svg className="employee-level-star" viewBox="0 0 100 100" role="img" aria-label={`المستوى ${label}`}>
    <path fill={gold ? '#f8c743' : silver ? '#b8c3d1' : '#60a5fa'} stroke={gold ? '#d88a16' : silver ? '#64748b' : '#2563eb'} strokeWidth="2" strokeLinejoin="round" d="M50 3 64 32 96 37 73 60 79 93 50 77 21 93 27 60 4 37 36 32Z" />
    <path fill={gold ? '#ffe384' : silver ? '#e2e8f0' : '#93c5fd'} d="M50 3 50 53 4 37 36 32Z" />
    <text x="50" y="54" dy=".35em" textAnchor="middle" direction="ltr" fill="white" stroke={gold ? '#a86b10' : silver ? '#475569' : '#1d4ed8'} strokeWidth={2} strokeLinejoin="round" paintOrder="stroke" fontWeight="900" fontSize={Math.min(29, 46 / (label.length * 0.7))}>{label}</text>
  </svg>;
}

export function EmployeeLevelBadge({ employeeId, inList = false, gold = false }: { employeeId: string; inList?: boolean; gold?: boolean }) {
  const { reviewSummaries, summaryReady, syncError, resultsMode, resultsDate, features, currentAccount, users } = useData();
  if (!summaryReady || syncError || (!inList && (resultsMode || !features?.settings.missions))) return null;
  const stars = currentAccount?.id === employeeId ? features?.store?.wallet?.stars : undefined;
  const level = employeeLevel(stars ?? employeeMissions(employeeId, reviewSummaries, resultsDate).stars).level;
  const tier = features ? employeeTier(users.find(user => user.id === employeeId)?.points ?? 0, features.settings) : 'bronze';
  return <LevelStar silver={tier === 'silver'} level={level} gold={gold || Boolean(features && employeeTier(users.find(user => user.id === employeeId)?.points ?? 0, features.settings) === 'gold')} />;
}
