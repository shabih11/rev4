import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
const githubKeys = createRemoteJWKSet(new URL('https://token.actions.githubusercontent.com/.well-known/jwks'));
export async function verifyGithubToken(token: string, keys: JWTVerifyGetKey = githubKeys) {
  const { payload } = await jwtVerify(token, keys, { issuer: 'https://token.actions.githubusercontent.com',
    audience: 'rev4-windsor-supabase', algorithms: ['RS256'], maxTokenAge: '5m', clockTolerance: 10 });
  const refs = ['refs/heads/main', 'refs/heads/codex/supabase-production'];
  if (payload.repository !== 'shabih11/rev4' || typeof payload.ref !== 'string' || !refs.includes(payload.ref) ||
    !['schedule','workflow_dispatch','push'].includes(String(payload.event_name)) ||
    payload.workflow_ref !== `shabih11/rev4/.github/workflows/windsor-sync.yml@${payload.ref}`) throw new Error('Untrusted workflow');
  return payload;
}
