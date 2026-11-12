const missions = new Set(['daily-two', 'partner', 'ten', 'days', 'partners', 'recovery']);

const design = {
  level: {
    colors: ['#b78320', '#e8bc56'],
    cell: 'M10 12 34 18 46 46 18 34Z',
  },
};

const angles = [0, 180, 90, 270];
const grades = ['green', 'blue', 'gold'] as const;

export function AchievementBadge({ progress = 0, missionId = 'level', band = 0 }: { progress?: number; missionId?: string; band?: number }) {
  const { colors, cell } = design.level;
  const grade = grades[Math.max(0, Math.min(2, band))];
  const count = Math.floor(Math.max(0, Math.min(1, progress + 1e-9)) * 4);

  if (missions.has(missionId)) {
    return <img
      src={`${import.meta.env.BASE_URL}badges/grades/${grade}/${missionId}-${count}.png`}
      alt=""
      data-grade={band}
      className="h-14 w-14 shrink-0 object-contain"
    />;
  }

  return <svg viewBox="0 0 100 100" className="h-14 w-14 shrink-0" aria-hidden="true">
    {angles.map((angle, index) => (
      <path
        key={angle}
        d={cell}
        transform={`rotate(${angle} 50 50)`}
        fill={index < count ? colors[index % 2] : '#d5deea'}
      />
    ))}
  </svg>;
}
