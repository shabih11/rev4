type Vessel = { name: string; width: number; height: number; preferredX: number; order: number };
export type SeaFleetPosition = { name: string; x: number; y: number; fit: number };

// A unit at each side, two behind, three ahead; measure the full sail/cutout frame.
export function seaFleetLayout(vessels: readonly Vessel[], width: number, height: number): SeaFleetPosition[] {
  if (!vessels.length || width <= 0 || height <= 0) return [];
  const unit = Math.max(4.5, Math.min(9, width * .015));
  const top = height * .35;
  const bottom = height - unit;
  const ordered = [...vessels].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'ar'));
  for (let step = 0; step < 45; step++) {
    const fit = .96 ** step;
    const placed: Array<{ left: number; right: number; top: number; bottom: number; x: number; y: number; name: string }> = [];
    for (const vessel of ordered) {
      const w = vessel.width * fit, h = vessel.height * fit;
      const candidates: typeof placed = [];
      for (let y = top + h; y <= bottom; y += unit) {
        if (placed.length && y < placed[placed.length - 1].y + unit * 3) continue;
        for (let x = w / 2 + unit; x <= width - w / 2 - unit; x += unit) {
          const box = { left: x - w / 2, right: x + w / 2, top: y - h, bottom: y, x, y, name: vessel.name };
          if (placed.every(other => Math.abs(x - other.x) >= unit * 2 && (
            box.left >= other.right + unit || box.right + unit <= other.left
            || box.top >= other.bottom + unit * 3 || box.bottom + unit * 2 <= other.top
          ))) candidates.push(box);
        }
        if (candidates.length) break;
      }
      candidates.sort((a, b) => Math.abs(a.x - vessel.preferredX * width) - Math.abs(b.x - vessel.preferredX * width));
      if (!candidates.length) break;
      placed.push(candidates[0]);
    }
    if (placed.length === ordered.length) return placed.map(({ name, x, y }) => ({ name, x, y, fit }));
  }
  return [];
}
