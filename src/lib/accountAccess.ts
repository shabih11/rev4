import type { UserAccount } from './mockData';

interface AccountClient {
  rpc(name: 'get_my_account'): {
    abortSignal(signal: AbortSignal): PromiseLike<{ data: unknown; error: { code?: string } | null; status: number }>;
  };
}
type AccountAccess = { account: UserAccount | null; error: 'denied' | 'unavailable' | null };
export const accountAccessMessages = {
  denied: 'الحساب غير مخوّل للدخول. تواصلي مع الإدارة.',
  unavailable: 'تعذر الاتصال بخدمة التحقق من الحساب مؤقتًا. أعيدي المحاولة بعد قليل.',
};
const pending = new WeakMap<AccountClient, Map<string, Promise<AccountAccess>>>();

async function lookup(client: AccountClient): Promise<AccountAccess> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { data, error, status } = await client.rpc('get_my_account').abortSignal(AbortSignal.timeout(8000));
      if (!error) {
        const account = data as UserAccount | null;
        if (!account || typeof account.id !== 'string' || !account.id || !['admin', 'manager', 'employee', 'viewer'].includes(account.role)) {
          return { account: null, error: 'denied' };
        }
        return { account, error: null };
      }
      if (status === 401 || status === 403 || ['42501', 'PGRST301', 'PGRST302', 'PGRST303'].includes(error.code || '')) {
        return { account: null, error: 'denied' };
      }
      if (!(status === 0 || status === 408 || status >= 500 || /^PGRST00[0-3]$/.test(error.code || '') || error.code === '57014')) {
        return { account: null, error: 'unavailable' };
      }
    } catch { /* Transport failures never grant access or imply missing membership. */ }
    if (attempt === 0) await new Promise(resolve => setTimeout(resolve, 500));
  }
  return { account: null, error: 'unavailable' };
}

// Share only overlapping checks for the same session. Never cache authorization.
export function getMyAccount(client: AccountClient, accessToken: string): Promise<AccountAccess> {
  if (!accessToken) return Promise.resolve({ account: null, error: 'denied' });
  const requests = pending.get(client) || new Map<string, Promise<AccountAccess>>();
  const existing = requests.get(accessToken);
  if (existing) return existing;
  const request = lookup(client).finally(() => {
    requests.delete(accessToken);
    if (!requests.size) pending.delete(client);
  });
  requests.set(accessToken, request);
  pending.set(client, requests);
  return request;
}
