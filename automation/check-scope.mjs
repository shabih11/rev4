import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const full = () => ({ app: true, browser: true, database: true });
const documentation = path => /^(?:README|AGENTS)\.md$/.test(path) || /^docs\/.*\.md$/.test(path);
const image = path => /^(?:src\/assets|public)\/.+\.(?:png|jpe?g|webp|gif|svg|avif|ico|woff2?)$/i.test(path);

export async function verifiedPushBase(env, request = fetch) {
  const workflow = env.GITHUB_WORKFLOW_REF?.match(/\/\.github\/workflows\/([^/@]+\.ya?ml)@/)?.[1];
  if (!env.GH_TOKEN || !workflow || !env.GITHUB_REPOSITORY || !env.GITHUB_REF_NAME) return '';
  try {
    const url = new URL(`${env.GITHUB_API_URL || 'https://api.github.com'}/repos/${env.GITHUB_REPOSITORY}/actions/workflows/${encodeURIComponent(workflow)}/runs`);
    url.search = new URLSearchParams({ branch: env.GITHUB_REF_NAME, status: 'success', per_page: '1' }).toString();
    const response = await request(url, {
      headers: { Authorization: `Bearer ${env.GH_TOKEN}`, Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return '';
    const run = (await response.json()).workflow_runs?.[0];
    return run?.conclusion === 'success' && run.head_branch === env.GITHUB_REF_NAME ? run.head_sha || '' : '';
  } catch {
    return '';
  }
}

// Unknown paths and unavailable history must never silently drop a check.
export function classifyChanges(paths) {
  if (paths === null) return full();
  const scope = { app: false, browser: false, database: false };
  for (const path of paths) {
    if (documentation(path)) continue;
    scope.app = true;
    if (image(path) || /^src\/.+\.css$/.test(path)) continue;
    if (/^tests\/browser\//.test(path) || path === 'playwright.config.ts') {
      scope.browser = true;
      continue;
    }
    if (/^tests\/.+\.mjs$/.test(path) && path !== 'tests/checkScope.test.mjs') continue;
    if (/^src\/(?:pages|components)\/.+\.[cm]?[jt]sx?$/.test(path) || /^src\/(?:App|main)\.tsx$/.test(path)) {
      scope.browser = true;
      continue;
    }
    // Shared data/auth code, SQL, tooling, dependencies and new file categories.
    return full();
  }
  return scope;
}

export function changedPaths({ cwd = process.cwd(), base, staged = false } = {}) {
  const git = args => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const names = text => text.split('\0').filter(Boolean);
  try {
    if (base !== undefined) {
      if (!/^[a-f\d]{40}$/i.test(base) || /^0+$/.test(base)) return null;
      git(['cat-file', '-e', `${base}^{commit}`]);
      // Include the whole push/PR and both sides of renames, not only HEAD^.
      return names(git(['diff', '--name-only', '--no-renames', '-z', base, 'HEAD', '--']));
    }
    if (staged) return names(git(['diff', '--cached', '--name-only', '--no-renames', '-z', '--']));
    return [...new Set([
      ...names(git(['diff', '--name-only', '--no-renames', '-z', 'HEAD', '--'])),
      ...names(git(['ls-files', '--others', '--exclude-standard', '-z'])),
    ])];
  } catch {
    return null;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const baseIndex = args.indexOf('--base');
  const isCI = process.env.GITHUB_ACTIONS === 'true';
  const all = args.includes('--all') || process.env.GITHUB_EVENT_NAME === 'workflow_dispatch';
  // A newer push can cancel an older run. Compare with verified history so a
  // cosmetic follow-up cannot bypass unfinished auth/SQL checks from that run.
  const ciBase = isCI && !all && baseIndex < 0 && process.env.GITHUB_EVENT_NAME === 'push'
    ? await verifiedPushBase(process.env) : process.env.CHECK_BASE;
  const paths = all ? null : changedPaths({
    staged: args.includes('--staged'),
    base: baseIndex >= 0 ? (args[baseIndex + 1] || '') : isCI ? (ciBase || '') : undefined,
  });
  const scope = classifyChanges(paths);
  const output = Object.entries(scope).map(([key, value]) => `${key}=${value}`).join('\n') + '\n';
  process.stdout.write(paths === null ? 'Full checks: forced or change range unavailable.\n' : `Changed files: ${paths.length}\n`);
  process.stdout.write(output);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, output);
}
