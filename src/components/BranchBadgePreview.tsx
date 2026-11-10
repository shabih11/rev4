import { useId } from 'react';

const badges = [
  { file: 'branch-500-reviews.png', name: '٥٠٠ تقييم للفرع', coins: 1000 },
  { file: 'branch-1000-reviews.png', name: '١٬٠٠٠ تقييم للفرع', coins: 10000 },
  { file: 'sunday-coffee.png', name: 'قهوة الأحد', description: 'الفرع الأكثر تقييمات في نهاية الأسبوع', coins: 40 },
  { file: 'rocket-launch.png', name: 'الانطلاق الصاروخي', description: '١٠٠ تقييم خلال ٧ أيام', coins: 75 },
  { file: 'sea-mission.png', name: 'مهمة البحر', description: 'تقييمات طوال الرحلة البحرية', coins: 125 },
];

const formatCoins = new Intl.NumberFormat('ar-SA-u-nu-arab');

export function BranchBadgePreview() {
  const detailsId = useId();

  return (
    <section className="rounded-xl border border-dashed border-slate-300 bg-white p-4" aria-label="فرع تجريبي لمعاينة الشارات">
      <ul className="flex flex-wrap gap-3">
        {badges.map(badge => (
          <li key={badge.file}>
            <button
              type="button"
              aria-label={badge.name}
              popoverTarget={`${detailsId}-${badge.file}`}
              className="flex h-24 w-24 items-center justify-center rounded-lg border border-transparent hover:bg-slate-50"
            >
              <img
                src={`${import.meta.env.BASE_URL}badges/${badge.file}`}
                alt=""
                className="h-auto max-h-20 w-auto max-w-20"
              />
            </button>
            <div id={`${detailsId}-${badge.file}`} popover="auto" role="status" dir="rtl"
              className="fixed inset-0 m-auto h-fit w-fit max-w-[90vw] rounded-xl border border-slate-200 bg-white px-5 py-3 text-center font-bold text-slate-900 shadow-lg">
              <p>{badge.name}</p>
              {badge.description && <p className="mt-1 text-sm font-normal text-slate-600">{badge.description}</p>}
              <p className="mt-2 text-sm font-medium text-slate-700">المكافأة: {formatCoins.format(badge.coins)} عملة</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
