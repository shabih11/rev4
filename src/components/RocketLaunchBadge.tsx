import { useData } from '../context/DataContext';

export function RocketLaunchBadge({ branch }: { branch?: string }) {
  const { rocketLaunchWinningBranches } = useData();
  if (!branch || !rocketLaunchWinningBranches.has(branch)) return null;

  return (
    <img
      src={`${import.meta.env.BASE_URL}badges/rocket-launch.png`}
      alt={`الانطلاق الصاروخي، فرع ${branch}: ١٠٠ تقييم خلال أسبوع`}
      className="inline-block h-14 w-auto shrink-0 align-middle"
    />
  );
}
