import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { classifyChanges, changedPaths, verifiedPushBase } from '../automation/check-scope.mjs';
const full = { app: true, browser: true, database: true };

test('documentation does not build or deploy; styles and images keep the build without provisioning services', () => {
  assert.deepEqual(classifyChanges(['AGENTS.md', 'README.md', 'docs/testing.md']), { app: false, browser: false, database: false });
  assert.deepEqual(classifyChanges(['src/assets/sea/boat.webp', 'src/components/SeaMission.css']), { app: true, browser: false, database: false });
  assert.deepEqual(classifyChanges([]), { app: false, browser: false, database: false });
});

test('UI behavior runs the real browser; shared data, security, dependencies and unknown changes get full checks', () => {
  assert.deepEqual(classifyChanges(['src/pages/Login.tsx', 'src/components/AdminShiftCalendar.tsx']), { app: true, browser: true, database: false });
  assert.deepEqual(classifyChanges(['tests/browser/fixtures.ts']), { app: true, browser: true, database: false });
  for (const file of ['src/context/AuthProvider.tsx', 'src/lib/cloudSync.ts', 'src/hooks/useRecordScope.ts',
    'src/types/index.ts', 'supabase/migrations/new.sql', 'package-lock.json', '.github/workflows/verify.yml',
    'automation/check-scope.mjs', 'tests/checkScope.test.mjs', 'new-tool.config.js', 'public/service-worker.js']) {
    assert.deepEqual(classifyChanges(['README.md', file]), full, file);
  }
  assert.deepEqual(classifyChanges(null), full);
});

test('unit tests alone keep Node checks without launching unrelated browser or database services', () => {
  assert.deepEqual(classifyChanges(['tests/employeeQuality.test.mjs']), { app: true, browser: false, database: false });
});

test('pushes use successful verification history, with full checks on API failure or a mismatched branch', async () => {
  const env = { GH_TOKEN: 'test-only-token', GITHUB_WORKFLOW_REF: 'test/repo/.github/workflows/pages.yml@refs/heads/main',
    GITHUB_REPOSITORY: 'test/repo', GITHUB_REF_NAME: 'main' };
  const sha = 'a'.repeat(40);
  const response = run => async url => {
    assert.equal(url.searchParams.get('status'), 'success');
    assert.equal(url.searchParams.get('branch'), 'main');
    return { ok: true, json: async () => ({ workflow_runs: [run] }) };
  };
  assert.equal(await verifiedPushBase(env, response({ conclusion: 'success', head_branch: 'main', head_sha: sha })), sha);
  for (const run of [{ conclusion: 'failure', head_branch: 'main', head_sha: sha },
    { conclusion: 'success', head_branch: 'other', head_sha: sha }]) {
    assert.equal(await verifiedPushBase(env, response(run)), '');
  }
  assert.equal(await verifiedPushBase(env, async () => { throw new Error('offline'); }), '');
  assert.equal(await verifiedPushBase({}, async () => { throw new Error('must not call'); }), '');
});

test('the whole pushed range and both sides of a rename are checked; missing history falls back to full', t => {
  const cwd = mkdtempSync(join(tmpdir(), 'rev4-scope-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-q');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'user.name', 'Scope test');
  mkdirSync(join(cwd, 'src/lib'), { recursive: true });
  writeFileSync(join(cwd, 'src/lib/account.ts'), 'export const version = 1;\n');
  git('add', '.'); git('commit', '-qm', 'base');
  const base = git('rev-parse', 'HEAD');
  writeFileSync(join(cwd, 'src/lib/account.ts'), 'export const version = 2;\n');
  git('add', '.'); git('commit', '-qm', 'data change');
  writeFileSync(join(cwd, 'README.md'), 'Documentation\n');
  git('add', '.'); git('commit', '-qm', 'docs change');
  assert.deepEqual(classifyChanges(changedPaths({ cwd, base })), full);
  assert.deepEqual(classifyChanges(changedPaths({ cwd, base: 'f'.repeat(40) })), full);
  assert.deepEqual(classifyChanges(changedPaths({ cwd, base: '0'.repeat(40) })), full);
  git('mv', 'src/lib/account.ts', 'README-old.md');
  const staged = changedPaths({ cwd, staged: true });
  assert.ok(staged.includes('src/lib/account.ts'));
  assert.deepEqual(classifyChanges(staged), full);
  writeFileSync(join(cwd, 'new.config.js'), 'export default {};\n');
  assert.ok(changedPaths({ cwd }).includes('new.config.js'));
});
