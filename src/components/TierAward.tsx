export function TierAward({ gold, iconOnly = false }: { gold: boolean; iconOnly?: boolean }) {
  const colors = gold
    ? ['#f8c743', '#ffe384', '#edaa27', '#ffda6c', '#d88a16']
    : ['#aebed7', '#e7eef9', '#8fa4c6', '#d0dced', '#758db6'];
  return <span className={`tier-award ${gold ? 'tier-award-gold' : 'tier-award-silver'}`}>
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M21.7 4.7a2.6 2.6 0 0 1 4.6 0l5.1 10.4 11.5 1.7a2.6 2.6 0 0 1 1.4 4.4L36 29.3l2 11.5a2.6 2.6 0 0 1-3.8 2.7L24 38.1l-10.2 5.4a2.6 2.6 0 0 1-3.8-2.7l2-11.5-8.3-8.1a2.6 2.6 0 0 1 1.4-4.4l11.5-1.7z" fill={colors[0]} />
      <path d="M24 3.3v20.1L16.6 15.1l5.1-10.4A2.6 2.6 0 0 1 24 3.3Z" fill={colors[1]} />
      <path d="m43 16.8-19 6.6 12 5.9 8.3-8.1a2.6 2.6 0 0 0-1.3-4.4Z" fill={colors[1]} />
      <path d="M24 23.4v14.7l10.2 5.4a2.6 2.6 0 0 0 3.8-2.7l-2-11.5z" fill={colors[2]} />
      <path d="M24 23.4 12 29.3l-2 11.5a2.6 2.6 0 0 0 1.6 2.8z" fill={colors[3]} />
      <path d="m3.7 21.2 8.3 8.1 12-5.9-19-6.6a2.6 2.6 0 0 0-1.3 4.4Z" fill={colors[4]} />
    </svg>
    {!iconOnly && <span>{gold ? 'متميزة' : 'خبيرة'}</span>}
  </span>;
}
