import { useData } from '../context/DataContext';

export function SeaMissionBadge({ branch }: { branch?: string }) {
  const { features, seaWinningBranches } = useData();
  if (!features?.settings.branchBadges || !branch || !seaWinningBranches.has(branch)) return null;

  return (
    <img
      src={`${import.meta.env.BASE_URL}badges/sea-mission.png`}
      alt={`شارة البحر، فرع ${branch} أكمل مهمة البحر`}
      className="inline-block h-14 w-auto shrink-0 align-middle"
    />
  );
}
