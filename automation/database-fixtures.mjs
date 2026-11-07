// security.sql exercises manager writes in an open month. Move only its dated
// Wed/Thu/Fri fixtures together; preserve invalid-date and sign-in timestamp tests.
export function securityFixturesForMonth(sql, today) {
  const [year, month] = today.split('-').map(Number);
  const first = new Date(Date.UTC(year, month - 1, 1));
  const wednesday = 8 + (3 - first.getUTCDay() + 7) % 7;
  for (const [oldDay, offset] of [[21, 0], [22, 1], [23, 2]]) {
    const date = new Date(Date.UTC(year, month - 1, wednesday + offset));
    const iso = date.toISOString().slice(0, 10);
    const local = `${iso.slice(8)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;
    sql = sql.replaceAll(`${oldDay}-10-2026`, local).replaceAll(`2026-10-${oldDay}`, iso);
  }
  return sql;
}
