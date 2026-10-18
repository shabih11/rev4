---
name: insecure-defaults
description: Detect insecure default configuration — fallback secrets, default credentials, fail-open security switches, weak crypto, permissive access (e.g. open Firestore rules), and debug leakage. Use when touching auth, authorization, secrets, security config, Firestore rules, CI permissions, or when asked to audit for insecure defaults. Vendored from trailofbits/skills (plugins/insecure-defaults) with a manual workflow for non-Claude agents.
---

# Insecure Defaults (Trail of Bits — vendored)

Upstream ships this as a Claude Code plugin (`commands/audit.md` + a JS workflow).
This wrapper exposes the same reference corpus as a manual, agent-agnostic procedure.

## Reference corpus (read only the relevant ones)

| Category | File |
|---|---|
| Fallback secrets (`process.env.X \|\| 'dev-secret'`) | [references/fallback-secrets.md](references/fallback-secrets.md) |
| Default credentials | [references/default-credentials.md](references/default-credentials.md) |
| Fail-open security switches | [references/fail-open-security.md](references/fail-open-security.md) |
| Permissive access (CORS `*`, open rules, broad roles) | [references/permissive-access.md](references/permissive-access.md) |
| Weak crypto | [references/weak-crypto.md](references/weak-crypto.md) |
| Debug features left enabled | [references/debug-features.md](references/debug-features.md) |

Each file lists **Report when / Skip when** criteria and vulnerable vs. safe examples.

## Procedure

1. **Scope**: limit to the changed files or the path the user names. Full-repo audits
   only on explicit request.
2. **Sweep**: pick the categories relevant to the scope; grep for candidates
   (env fallbacks, `|| '...'`, `if true`, `allow read, write`, `debug`, `*` origins,
   hardcoded passwords/tokens, `Math.random` for secrets, MD5/SHA1).
3. **Verify (refute first)**: for each candidate, trace the value to the security
   decision it reaches. Drop it if the unconfigured value is the secure one, or the
   value never reaches an enforcement point. Read the *default*, not the flag name.
4. **Report** only confirmed findings: `file:line`, category, why it is insecure when
   unconfigured, and a minimal fix. State explicitly when no candidates matched
   (this is not proof of absence).

## Firebase-specific checks (this project)

- `firestore.rules`: default-deny, no `if true`, no `request.auth != null` as the only
  check on sensitive collections, role checks derived from server data not client input.
- Client role checks are UX only; authorization must live in rules.
- Firebase web config is public by design — not a finding by itself.
- No service-account keys or admin credentials in tracked files.
