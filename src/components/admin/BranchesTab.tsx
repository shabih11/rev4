import { useData } from '../../context/DataContext';
import { AdministrationPhone } from '../MissingShiftRequest';

export function BranchesTab({ branch, showToast }: {
  branch: string;
  showToast: (message: string) => void;
}) {
  const { branchSettings, updateBranchGoogleLink } = useData();
  const settings = branchSettings[branch];

  return <section className="max-w-xl space-y-5">
    <AdministrationPhone />
    <form className="space-y-3 rounded-2xl border border-slate-200 p-4" onSubmit={event => {
      event.preventDefault();
      const googleApi = String(new FormData(event.currentTarget).get('googleApi') ?? '').trim();
      if (!updateBranchGoogleLink(branch, googleApi)) showToast('تعذر حفظ رابط الفرع');
    }}>
      <label className="block text-sm font-bold">
        رابط Google API
        <input disabled={!settings} name="googleApi" type="text" dir="ltr" key={settings?.googleApi} defaultValue={settings?.googleApi ?? ''}
          className="mt-2 w-full rounded-xl border border-slate-300 p-3" />
      </label>
      <button disabled={!settings} className="action-primary min-h-11">حفظ</button>
    </form>
  </section>;
}
