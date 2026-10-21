import companyLogo from '../assets/company-logo.png';

export function Brand({ light = false, compact = false }: { light?: boolean; compact?: boolean }) {
  return <div className={`brand${light ? ' brand--light' : ''}${compact ? ' brand--compact' : ''}`}>
    <img className="brand__logo" src={companyLogo} alt="أي آم سبيشل" width={1780} height={877} decoding="async" />
    {!compact && <span className="brand__copy"><span>إدارة السمعة الرقمية</span></span>}
  </div>;
}

export function BrandName() {
  return <span className="inline-flex items-center gap-1 whitespace-nowrap text-sm font-extrabold" dir="rtl" aria-label="اي ام سبيشل">
    <span className="text-red-600">اي ام</span>
    <span className="text-yellow-500">سبيشل</span>
  </span>;
}

export function PageLoading({ error }: { error?: string | null }) {
  return <div className="page-loading" role={error ? 'alert' : 'status'} dir="rtl"><img className="brand__logo" src={companyLogo} alt="أي آم سبيشل" width={1780} height={877} decoding="async" /><p>{error || 'جاري التحميل…'}</p></div>;
}
