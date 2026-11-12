import { useData } from '../context/DataContext';

export function BranchMilestoneBadge({ branch }: { branch?: string }) {
  const { features, branchesWithReviewMilestone, branchBadgeRewards, reviewSummaries } = useData();
  if (!features?.settings.branchBadges || !branch) return null;
  const count = reviewSummaries.filter(review => review.branch === branch).length;
  const earned = (badge: 'milestone' | 'milestone500') => branchBadgeRewards.some(reward => reward.branch === branch && reward.badge === badge);
  const badges = [
    { count: 500, label: '٥٠٠', visible: count >= 500 || earned('milestone500') },
    { count: 1000, label: '١٬٠٠٠', visible: branchesWithReviewMilestone.has(branch) || earned('milestone') },
  ];
  return <span className="inline-flex shrink-0 items-center gap-1 align-middle">{badges.filter(badge => badge.visible).map(badge => <img key={badge.count}
    src={`${import.meta.env.BASE_URL}badges/branch-${badge.count}-reviews.png`}
    alt={`شارة فرع ${branch} لبلوغ ${badge.label} تقييم`}
    className="inline-block h-9 w-auto shrink-0 sm:h-12" />)}</span>;
}
