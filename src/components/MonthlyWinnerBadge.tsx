export function MonthlyWinnerBadge({ className = 'size-8' }: { className?: string }) {
  return <span className={`inline-flex shrink-0 items-center justify-center ${className}`} role="img" aria-label="المركز الأول في الشهر السابق" title="المركز الأول في الشهر السابق · يستمر التاج طوال الشهر الحالي">
    <svg viewBox="0 0 48 48" className="size-full" aria-hidden="true">
      <path d="m6 13 10 8 8-15 8 15 10-8-5 24H11Z" fill="#f8c743" />
      <path d="m6 13 10 8 8-15v28H11Z" fill="#ffe384" />
      <path d="m24 6 8 15 10-8-5 24H24Z" fill="#edaa27" />
      <path d="m16 21 8 6 8-6-8 13Z" fill="#ffda6c" />
      <rect x="10" y="34" width="28" height="8" rx="3" fill="#d88a16" />
      <path d="M13 35h22v3H13Z" fill="#ffda6c" />
      <circle cx="6" cy="11" r="3" fill="#f8c743" /><circle cx="24" cy="5" r="3" fill="#f8c743" /><circle cx="42" cy="11" r="3" fill="#f8c743" />
      <path d="m24 29 3 3-3 3-3-3Z" fill="#fff2b4" />
    </svg>
  </span>;
}
