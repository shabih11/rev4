/** Arabic agreement for review counts, including fractional credited balances. */
export function arabicReviewCount(count: number, kind?: 'positive' | 'negative' | 'shared'): string {
  const forms = kind === 'positive' ? ['إيجابي', 'إيجابيان', 'إيجابية', 'إيجابيًا']
    : kind === 'negative' ? ['سلبي', 'سلبيان', 'سلبية', 'سلبيًا']
    : kind === 'shared' ? ['مشترك', 'مشتركان', 'مشتركة', 'مشتركًا'] : null;
  const adjective = (index: number) => forms ? ` ${forms[index]}` : '';
  if (count === 0) return `بدون تقييمات${adjective(2)}`;
  if (count === 1) return `تقييم${adjective(0)} واحد`;
  if (count === 2) return `تقييمان${adjective(1)}`;
  const number = count.toLocaleString('ar-SA-u-nu-latn', { maximumFractionDigits: 1 });
  const remainder = count % 100;
  if (Number.isInteger(count) && remainder >= 3 && remainder <= 10) return `${number} تقييمات${adjective(2)}`;
  if (Number.isInteger(count) && remainder === 0) return `${number} تقييم${adjective(0)}`;
  return `${number} تقييمًا${adjective(3)}`;
}
