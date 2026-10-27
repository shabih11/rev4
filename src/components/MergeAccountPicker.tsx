import { arabicReviewCount } from '../lib/arabicReviewCount';
import type { UserAccount } from '../lib/mockData';

const branches = ['جاليري', 'ذافيو', 'سلام', 'القصر', 'المملكة', 'شرق', 'موظفة خارجية'];
export function MergeAccountPicker({ label, branch, onBranchChange, value, onChange, excludedId, users, ready }: {
  label: string; branch: string; onBranchChange: (branch: string) => void;
  value: string; onChange: (id: string) => void; excludedId?: string; users: UserAccount[]; ready: boolean;
}) {
  const employees = users.filter(user => user.role === 'employee' && user.branch === branch && user.id !== excludedId);
  return <fieldset className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
    <legend className="px-2 text-sm font-bold text-slate-800">{label}</legend>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <label className="grid gap-2 text-sm font-semibold">الفرع
        <select required value={branch} onChange={event => onBranchChange(event.target.value)} className="w-full min-h-11 border border-slate-300 rounded-xl p-3 bg-white">
          <option value="">اختاري الفرع</option>{branches.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
      </label>
      <label className="grid gap-2 text-sm font-semibold">الموظفة
        <select required disabled={!branch} value={value} onChange={event => onChange(event.target.value)} className="w-full min-h-11 border border-slate-300 rounded-xl p-3 bg-white disabled:bg-slate-100 disabled:text-slate-400">
          <option value="">{branch ? 'اختاري الموظفة' : 'اختاري الفرع أولًا'}</option>
          {employees.map(user => <option key={user.id} value={user.id}>{user.name} — {ready ? arabicReviewCount(user.reviewsCount) : '…'}</option>)}
        </select>
      </label>
    </div>
  </fieldset>;
}
