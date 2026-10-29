export function accountSetupEnabled(target: string, hostname: string, development = false) {
  return target === 'all' || (target === 'github-pages' && (hostname === 'shabih11.github.io' || development));
}
export function normalizeUsername(value: string) { return value.trim().toLowerCase(); }
export function validUsername(value: string) {
  return /^[a-z0-9][a-z0-9._-]{2,31}$/.test(value) && !['admin','administrator','root','support'].includes(value);
}
