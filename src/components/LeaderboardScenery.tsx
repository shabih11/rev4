import { useId } from 'react';

// A fixed mesh keeps the same quiet polygon pattern between renders.
const columns = 9;
const rows = 7;
const palette = ['#ffffff', '#fafcfb', '#f3f7f6', '#f7f9fc', '#f9f7f2', '#eef4f3', '#f5f3f8'];
const points = Array.from({ length: rows + 1 }, (_, row) =>
  Array.from({ length: columns + 1 }, (_, column) => [
    column * 150 + (column === 0 || column === columns ? 0 : ((row * 37 + column * 53) % 95) - 47),
    row * 150 + (row === 0 || row === rows ? 0 : ((row * 61 + column * 29) % 81) - 40),
  ].join(',')),
);

export function LeaderboardScenery() {
  const wash = useId();
  return <div className="valley-scenery" aria-hidden="true">
    <svg viewBox="0 0 1350 1050" preserveAspectRatio="none">
      <defs><linearGradient id={wash} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#fff" stopOpacity=".72"/><stop offset=".55" stopColor="#fff" stopOpacity=".12"/><stop offset="1" stopColor="#fff" stopOpacity=".55"/></linearGradient></defs>
      <path fill="#fff" d="M0 0h1350v1050H0z"/>
      {Array.from({ length: rows * columns }, (_, index) => {
        const row = Math.floor(index / columns);
        const column = index % columns;
        const a = points[row][column], b = points[row][column + 1];
        const c = points[row + 1][column], d = points[row + 1][column + 1];
        return <g key={index}>
          <polygon points={`${a} ${b} ${index % 2 ? c : d}`} fill={palette[(index * 3 + row) % palette.length]}/>
          <polygon points={`${index % 2 ? b : a} ${d} ${c}`} fill={palette[(index * 5 + row + 2) % palette.length]}/>
        </g>;
      })}
      <path fill={`url(#${wash})`} d="M0 0h1350v1050H0z"/>
    </svg>
  </div>;
}
