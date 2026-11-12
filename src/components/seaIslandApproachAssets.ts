import shoreBreak from '../assets/sea/shore-break.webp';
import day6 from '../assets/sea/coast-visible-day-6.webp';
import day6Mobile from '../assets/sea/coast-visible-day-6-mobile.webp';
import day7 from '../assets/sea/coast-visible-day-7.webp';
import day7Mobile from '../assets/sea/coast-visible-day-7-mobile.webp';
import day8 from '../assets/sea/coast-visible-day-8.webp';
import day8Mobile from '../assets/sea/coast-visible-day-8-mobile.webp';
import day9 from '../assets/sea/coast-visible-day-9.webp';
import day9Mobile from '../assets/sea/coast-visible-day-9-mobile.webp';
import day10 from '../assets/sea/coast-visible-day-10.webp';
import day10Mobile from '../assets/sea/coast-visible-day-10-mobile.webp';
import day1 from '../assets/sea/island-approach-day-1.webp';
import day2 from '../assets/sea/island-approach-day-2.webp';
import day3 from '../assets/sea/island-approach-day-3.webp';
import day4 from '../assets/sea/island-approach-day-4.webp';
import day5 from '../assets/sea/island-approach-day-5.webp';

// Alpha bounds frame each cutout at the same beach baseline; source files stay intact.
export const ISLAND_APPROACH_ASSETS = [
  { src: day1, mobile: day1, aspect: 10.90355330, left: -0.60521, top: -131.97970, width: 101.11732, height: 367.51269 },
  { src: day2, mobile: day2, aspect: 10.67980296, left: -0.09225, top: -121.67488, width: 100.18450, height: 356.65025 },
  { src: day3, mobile: day3, aspect: 9.97685185, left: -0.46404, top: -115.27778, width: 100.78886, height: 335.18519 },
  { src: day4, mobile: day4, aspect: 10.44444444, left: -0.27752, top: -139.61353, width: 100.46253, height: 349.75845 },
  { src: day5, mobile: day5, aspect: 11.04123711, left: -0.74697, top: -141.75258, width: 101.40056, height: 373.19588 },
  { src: day6, mobile: day6Mobile, aspect: 4.57142857, left: 0.00000, top: -25.14286, width: 100.00000, height: 152.28571 },
  { src: day7, mobile: day7Mobile, aspect: 4.35967302, left: 0.00000, top: -26.70300, width: 100.00000, height: 145.23161 },
  { src: day8, mobile: day8Mobile, aspect: 3.74707260, left: 0.00000, top: -17.56440, width: 100.00000, height: 125.29274 },
  { src: day9, mobile: day9Mobile, aspect: 3.44086022, left: 0.00000, top: -13.11828, width: 100.00000, height: 115.05376 },
  { src: day10, mobile: day10Mobile, aspect: 3.34029228, left: 0.00000, top: -11.69102, width: 100.00000, height: 111.69102 },
];

// One shared frame leaves enough headroom for every natural silhouette.
export const ISLAND_APPROACH_FRAME_ASPECT = Math.min(...ISLAND_APPROACH_ASSETS.slice(0, 5).map(asset => asset.aspect));

export const SEA_SHORE_BREAK = { src: shoreBreak, top: -97.87234, height: 276.59574 };
