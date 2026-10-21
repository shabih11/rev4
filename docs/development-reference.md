> وثيقة تاريخية من نسخة Firebase. التشغيل الحالي موثق في [عمليات Supabase](supabase-operations.md).

# مرجع التطوير التفصيلي

مرجع عند الحاجة فقط. التعليمات التشغيلية الحالية في `AGENTS.md` لها الأولوية.

## 0. Project Profile (read first)

| Area | Actual stack |
|---|---|
| App | Vite 8 SPA · React 19 · TypeScript 6 · react-router-dom 7 |
| Styling | Tailwind CSS 3 · framer-motion · lucide-react · swiper |
| Backend | Firebase Auth + Cloud Firestore (project `iamspec`, path `apps/rev4`) |
| Security boundary | `firestore.rules` (roles: system admin / branch manager / employee) |
| Lint / Build | `npm run lint` (oxlint) · `npm run build` (`tsc -b && vite build`) |
| Tests | `node --test tests/*.test.mjs` (some test files are git-ignored/local only) |
| Deploy | GitHub Pages via `.github/workflows/pages.yml` |
| Language | Arabic UI, RTL layout |

**Not used:** Next.js, PostgreSQL, SSR. Do not apply guidance from
those ecosystems. The Next.js skills are intentionally **not installed**.

**Private data:** `scripts/`, `reports/`, and several `src/lib/*` import files are
git-ignored because they contain local migration data or account provisioning.
Never commit, print, or copy their contents into responses, tests, or docs.

## 1. Core Principles

- Prioritize code quality, security, performance, and maintainability.
- Minimize token consumption without compromising correctness.
- Use installed skills selectively based on the task. Never activate all skills automatically.
- Avoid unnecessary research, repeated analysis, and redundant tool calls.
- Prefer simple, reliable solutions over unnecessary complexity.
- Preserve existing functionality unless changes are explicitly requested.
- Follow the project's existing architecture and conventions.
- Do not introduce new dependencies unless necessary.
- Do not perform unrelated refactoring.

## 2. Installed Skills (Lean & Cost-Effective Setup)

Installed at project level in `.agents/skills/` (tracked in `skills-lock.json`):

| Skill | Folder | Source | Role |
|---|---|---|---|
| React Best Practices | `vercel-react-best-practices` | vercel-labs/agent-skills | **Core**: React components, hooks, state, listeners |
| Insecure Defaults | `insecure-defaults` | trailofbits/skills (vendored manually*) | **Core**: Firestore rules, Auth, secrets, zero-leakage |
| Differential Review | `differential-review` | trailofbits/skills | **Core**: Targeted diff review for security/rules/scores |
| Web Design Guidelines | `web-design-guidelines` | vercel-labs/agent-skills | **Core**: Lightweight UI/UX, RTL check, accessibility |
| Frontend Design | `frontend-design` | anthropics/skills | **On-demand**: New pages/dashboards only |
| Playwright CLI | `playwright-cli` | microsoft/playwright-cli | **On-demand**: Critical user journeys verification only |

Restore on a new machine: `npx skills experimental_install`.
Update: `npx skills update -p`.

\* Upstream ships `insecure-defaults` as a Claude plugin without `SKILL.md`, so the
`skills` CLI cannot install it. Its `references/` were copied into
`.agents/skills/insecure-defaults/` with a local `SKILL.md` wrapper. It is **not**
in `skills-lock.json`; keep the folder committed.

## 3. Skill Selection

Before starting a task:

1. Identify the task type.
2. Determine which installed skills are relevant.
3. Select the minimum number of skills necessary (usually 0–2).
4. Avoid overlapping skills unless they provide distinct benefits.
5. Read only the `SKILL.md` (and only the referenced sub-files) needed for the task.

Do not load skills unrelated to the current task. Trivial edits (text, labels,
small style tweaks, one-line fixes) need **no** skill.

## 4. Skill-Specific Instructions

### React Best Practices — `vercel-react-best-practices`

Use when: creating/modifying React components, context (`AuthContext`, `DataContext`),
re-render or bundle-size issues, Firestore listener/data-fetching patterns.

Avoid when: trivial content changes, non-React code.

Project notes:
- This is a client-only Vite SPA: **ignore** RSC, Server Actions, `next/*`, and
  server-side caching rules in the skill. Apply re-render, bundle, and client
  data-fetching rules only.
- Ensure Firestore `onSnapshot` subscriptions are cleaned up in effects.
- No premature `useMemo`/`useCallback`; optimize only measured/obvious hot paths.

### Insecure Defaults — `insecure-defaults`

Use when: touching `firestore.rules`, `src/lib/firebase.ts`, `AuthContext`, role
checks, login flow (`loginInput.ts`), `cloudSync.ts`, admin scripts, env/config,
or CI workflow permissions.

Project notes:
- Firebase web config is public by design; real protection is `firestore.rules`
  + Auth. Never treat client-side role checks as authorization.
- Rules must default-deny; no `allow read, write: if true` or broad wildcards.
- Never commit service-account keys, admin tokens, passwords, or employee PII.
- Avoid fail-open fallbacks (e.g. falling back to mock data or admin role on error).

Skip full security reviews for cosmetic changes.

### Differential Review — `differential-review`

Use when: reviewing diffs that change `firestore.rules`, auth/role logic, data
sync/import logic, score calculation (`scoreCalculator.ts`, `reviewPeriod.ts`),
or the deploy workflow; and for critical PRs.

Focus on the actual diff (`git diff` / PR). Do not audit the whole repository
for minor changes.

### Web Design Guidelines — `web-design-guidelines`

Use when: reviewing completed UI, usability, accessibility, forms (Login, review
entry), navigation, responsive design, consistency.

Avoid when: backend/Firebase work, trivial text updates.

Report actionable issues (`file:line`) rather than proposing redesigns.
Check RTL correctness (`dir="rtl"`, logical spacing, icon mirroring).

### Frontend Design — `frontend-design` (On-Demand)

Use when: creating brand new pages/dashboards (`src/pages/*`) or major aesthetic redesigns.

Avoid when: tweaking existing screens, fixing bugs, small styling changes, editing data or business logic.

Project notes:
- Keep the existing Tailwind setup (`tailwind.config.js`); do not add a CSS framework.
- Design must be RTL-first and Arabic-typography friendly.
- Keep consistency with existing dashboards (Admin, SystemAdmin, Employee, Leaderboard).

### Playwright CLI — `playwright-cli` (On-Demand)

Use when: verifying critical journeys that cannot be validated statically (login → dashboard by role, shift submission).

Rules:
- Run against `npm run dev` (local) — never against production with real accounts.
- Never type real credentials into tests or logs; use test accounts provided by the user.
- Do not launch a browser for routine/minor changes; prefer targeted checks.
- Reuse sessions; avoid repeated screenshots/navigation.
- Stop once sufficient evidence confirms correctness.

### Excluded Skills (Speed & Cost Optimization / Stack Mismatch)

- **Modern Web Guidance**: Excluded because its massive token size (~180k words) and broad trigger scope cause high latency and excessive cost on routine frontend edits.
- **Building Components**: Excluded because the project contains only a small set of focused components (`src/components/`), making specialized component library tooling redundant.
- **Next.js Best Practices**: Not applicable (project is a client-only Vite SPA).

## 5. Prevent Skill Overlap — Workflows

| Task | Skills (in order) |
|---|---|
| New page / dashboard | Frontend Design → React Best Practices |
| UI review / a11y audit | Web Design Guidelines → Playwright (only if interactive check needed) |
| Component / hook edit | React Best Practices |
| Firestore rules / Auth / roles | Insecure Defaults → Differential Review (when reviewing the change) |
| Data model / sync / import logic | React Best Practices (if UI-bound) → Insecure Defaults (if access-related) |
| PR / diff review (sensitive) | Differential Review (+ Insecure Defaults if config/auth touched) |

Do not invoke multiple skills merely because they are available.

## 6. Token and Context Efficiency

- Keep analysis focused on the requested task.
- Avoid re-reading the same files; read only files needed for implementation.
- Prefer targeted searches (`rg`) over scanning the repository.
- Exclude `node_modules/`, `dist/`, `reports/`, and large JSON in `src/lib/` from searches.
- Avoid large command outputs (`| tail`, `| head`).
- Do not re-retrieve documentation already in context.
- Minimize screenshots and browser snapshots.
- Avoid debugging loops; stop and reassess after two failed attempts.
- Keep final responses concise. No lengthy reports unless requested.

Never sacrifice essential verification or security to save tokens.

## 7. Implementation Workflow

1. Understand the request.
2. Inspect the relevant existing code.
3. Identify applicable project conventions.
4. Select relevant skills (Section 5).
5. Implement the smallest complete solution.
6. Run targeted verification (Section 8).
7. Fix issues directly related to the changes.
8. Summarize the outcome.

Simple tasks: skip planning. Complex tasks: short plan first.
Do not expand scope without authorization.

## 8. Testing Policy

Proportional to risk:

| Change | Verification |
|---|---|
| Minor (text/style) | None or quick visual check |
| Standard (logic/component) | `npm run lint` + `npm run build` |
| Logic in `src/lib/` | Relevant `node --test tests/<file>.test.mjs` if it exists |
| Complex UI / flows | Above + targeted Playwright check |
| Rules / Auth / roles | Above + Differential Review; rules tested via emulator if available |

- Do not repeat identical successful runs.
- Never claim tests passed unless actually executed.
- Never run scripts in `scripts/` (they touch real Firebase data/accounts) without explicit permission.

## 9. Security and Data Protection

- Never expose API keys, tokens, passwords, or secrets; never hardcode credentials.
- Follow least privilege in `firestore.rules` and CI permissions.
- Validate untrusted input (imports, form fields, login input).
- Protect authentication and authorization boundaries server-side (rules), not only in UI.
- Never modify or delete production Firestore data or deploy rules
  (`firebase deploy`) without explicit authorization.
- Never weaken security controls to simplify implementation.
- Do not log or display employee emails/passwords.

## 10. Dependency Management

- Prefer existing dependencies (Tailwind, framer-motion, lucide-react, clsx, tailwind-merge).
- Avoid unnecessary packages; check React 19 / Vite 8 compatibility before adding.
- Do not replace stable libraries or upgrade unrelated packages.

## 11. Communication

- Communicate in Arabic unless otherwise requested.
- Keep explanations concise and technically accurate.
- Report important architectural decisions and significant risks.
- Clearly state any tests that were not performed.
- Do not claim completion if important work remains.

## 12. Final Rule

Priority order:

1. Correctness
2. Security
3. Maintainability
4. Performance
5. Efficient tool and skill usage
6. Minimal token consumption

Skills are specialized tools, not mandatory steps. Produce reliable,
production-quality results with the fewest necessary operations.

