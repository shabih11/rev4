import { useData } from '../context/DataContext';

export function BranchMilestoneBadge({ branch }: { branch?: string }) {
  const { branchesWithReviewMilestone } = useData();
  if (!branch || !branchesWithReviewMilestone.has(branch)) return null;

  return (
    <img
      src={`${import.meta.env.BASE_URL}badges/branch-1000-reviews.png`}
      alt={`شارة فرع ${branch} لبلوغ ١٬٠٠٠ تقييم`}
      className="inline-block h-12 w-auto shrink-0 align-middle"
    />
  );
}
