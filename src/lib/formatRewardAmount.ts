export const formatRewardAmount = (value: number) => (Math.round(value / 10) * 10).toLocaleString('ar-SA-u-nu-latn', { maximumFractionDigits: 0 });
