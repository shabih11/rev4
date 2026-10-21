import companyLogo from '../assets/company-logo.png';

export function Brand({ light = false, compact = false }: { light?: boolean; compact?: boolean }) {
  return <div className={`brand${light ? ' brand--light' : ''}${compact ? ' brand--compact' : ''}`}>
    <img className="brand__logo" src={companyLogo} alt="أي آم سبيشل" width={1780} height={877} decoding="async" />
    {!compact && <span className="brand__copy"><span>إدارة السمعة الرقمية</span></span>}
  </div>;
}

export function PageLoading() {
  return <div className="page-loading" role="status" dir="rtl"><img className="brand__logo" src={companyLogo} alt="أي آم سبيشل" width={1780} height={877} decoding="async" /><p>جارٍ تجهيز الصفحة…</p></div>;
}
