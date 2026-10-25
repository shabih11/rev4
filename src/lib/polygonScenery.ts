const pale = ['#ffffff', '#fafcfb', '#f3f7f6', '#f7f9fc', '#f9f7f2', '#eef4f3', '#f5f3f8'];
const gold = ['#f3df9c', '#e6bd54', '#f7e7b9', '#dcb24a', '#efd28a', '#f9ecc7', '#e9c66a'];
export const sceneryOffset = (position: number) => Math.max(0, position) * 420;
export function goldBetweenSlides(position: number, slides: boolean[]) {
  const bounded = Math.max(0, Math.min(slides.length - 1, position));
  const index = Math.floor(bounded), fraction = bounded - index;
  return Number(Boolean(slides[index])) * (1 - fraction) + Number(Boolean(slides[index + 1])) * fraction;
}
export function polygonFill(index: number, centerX: number, centerY: number, offset: number, goldAmount: number) {
  const distance = Math.hypot((centerX - offset - 675) / 760, (centerY - 525) / 600);
  const weight = Math.max(0, 1 - distance) ** 1.1 * goldAmount;
  const start = pale[index % pale.length], end = gold[index % gold.length];
  const channels = [1, 3, 5].map(channel => Math.round(parseInt(start.slice(channel, channel + 2), 16) * (1 - weight) + parseInt(end.slice(channel, channel + 2), 16) * weight));
  return `rgb(${channels.join(',')})`;
}
export function makeSceneryMesh(slideCount: number) {
  const columns = Math.ceil((1350 + Math.max(0, slideCount - 1) * 420) / 150) + 1;
  const points = Array.from({ length: 8 }, (_, row) => Array.from({ length: columns + 1 }, (_, column) => [column * 150 + ((row * 37 + column * 53) % 95) - 47, row * 150 + (row === 0 || row === 7 ? 0 : ((row * 61 + column * 29) % 81) - 40)]));
  return Array.from({ length: 7 * columns }, (_, index) => {
    const row = Math.floor(index / columns), column = index % columns;
    const a = points[row][column], b = points[row][column + 1], c = points[row + 1][column], d = points[row + 1][column + 1];
    return (index % 2 ? [[a, b, c], [b, d, c]] : [[a, b, d], [a, d, c]]).map(triangle => ({ points: triangle.map(point => point.join(',')).join(' '), x: triangle.reduce((sum, point) => sum + point[0], 0) / 3, y: triangle.reduce((sum, point) => sum + point[1], 0) / 3 }));
  }).flat();
}
