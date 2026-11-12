import { useData } from '../context/DataContext';

export function SundayCoffeeBadge({ branch }: { branch?: string }) {
  const { features, sundayCoffeeWinningBranch, branchBadgeRewards } = useData();
  if (!features?.settings.branchBadges || !branch || (branch !== sundayCoffeeWinningBranch && !branchBadgeRewards.some(reward => reward.badge === 'coffee' && reward.branch === branch))) return null;

  return (
    <img
      src={`${import.meta.env.BASE_URL}badges/sunday-coffee.png`}
      alt={`قهوة الأحد، الفرع الفائز: ${branch}`}
      className="inline-block h-14 w-auto shrink-0 align-middle"
    />
  );
}
