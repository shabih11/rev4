import { UsageAnalytics } from '../components/analytics/UsageAnalytics';
import { useUsagePage } from '../hooks/useUsageAnalytics';
import { BranchesTab } from '../components/admin/BranchesTab';
import { ReviewsTab } from '../components/admin/ReviewsTab';
import { EmployeeTransfer } from '../components/EmployeeTransfer';
import { ResultReportsInbox } from '../components/ResultReportsInbox';
import { AdminShiftCalendar } from '../components/AdminShiftCalendar';
import { arabicReviewCount } from '../lib/arabicReviewCount';
import { EmployeeIdentity } from '../components/EmployeeIdentity';
import { EmployeeAvatar } from '../components/EmployeeFeatures';
import { AdditionalFeaturesSettings } from '../components/AdditionalFeaturesSettings';
import { AvatarStoreAdmin } from '../components/AvatarStoreAdmin';
import { EmployeeAccountActions } from '../components/EmployeeAccountActions';
import { Brand } from '../components/Brand';
import { belongsToBranch, isCoverageEmployee, employeeBranchLabel } from '../lib/employeeBranches';
import { LeaderboardLink } from '../components/LeaderboardLink';
import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useRecordScope } from '../hooks/useRecordScope';
import { AlertOctagon, ShieldAlert, Users, LogOut, Building2, CalendarClock, MessageSquareWarning, PlusCircle, CheckCircle2, BarChart3, Trash2, Edit, Zap, Settings, Store } from 'lucide-react';
import employeeImg from '../assets/employee.png';
import { newestFirst } from '../lib/employeeActivity';
import { formatTime } from '../lib/formatDate';

export const SystemAdminDashboard: React.FC = () => {
  const { logout } = useAuth();
  const { recordsReady, summaryReady, syncError, users, disabledEmployees, reviews, updateUser, addUser, timeline, addTimelineEvent, updateTimelineEvent, deleteTimelineEvent } = useData();
  const [activeTab, setActiveTab] = useState<'branches' | 'features' | 'avatars' | 'analytics'>('branches');
  useUsagePage(activeTab);
  
  const branches = ['جاليري', 'ذافيو', 'سلام', 'القصر', 'المملكة', 'شرق'];
  const [globalBranch, setGlobalBranch] = useState('all');
  const [analyticsBranch, setAnalyticsBranch] = useState('');
  const [branchView, setBranchView] = useState<'calendar' | 'employees' | 'reviews' | 'settings' | 'notes'>('calendar');
  const branchOpen = activeTab === 'branches' && globalBranch !== 'all';
  const employeeView = branchOpen && branchView === 'employees';
  const [openEmployeeId, setOpenEmployeeId] = useState<string | null>(null);
  const coverage = globalBranch === 'موظفة خارجية';
  useRecordScope({
    users: branchOpen,
    reviews: employeeView ? { all: true } : branchOpen && (branchView === 'calendar' || branchView === 'reviews') ? { branches: [globalBranch] } : undefined,
    timeline: employeeView ? { all: true } : branchOpen && (branchView === 'calendar' || branchView === 'notes') ? { branches: [globalBranch] } : undefined,
  });
  const reviewedIds = new Set(reviews.flatMap(review => review.linkedEmployeeIds));
  const branchEmployees = employeeView && recordsReady && summaryReady && !syncError
    ? [...users, ...disabledEmployees].filter(employee => {
        if (employee.role !== 'employee') return false;
        const inactive = !reviewedIds.has(employee.id);
        return coverage ? inactive || isCoverageEmployee(employee) : !inactive && belongsToBranch(employee, globalBranch);
      })
    : [];

  function openBranch(branch: string) {
    setGlobalBranch(branch);
    setBranchView(branch === 'موظفة خارجية' ? 'employees' : 'calendar');
    setComplaintEmployee('');
    setComplaintText('');
    setSafetyEmployee('');
    setSafetyText('');
    setEditingNoteId(null);
    setShowAddForm(false);
    setOpenEmployeeId(null);
    setNewEmpName('');
  }

  function navigate(tab: typeof activeTab) {
    setActiveTab(tab);
    if (tab === 'branches') openBranch('all');
  }

  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteTitle, setEditingNoteTitle] = useState('');
  const [editingNoteComment, setEditingNoteComment] = useState('');

  const navItems = [
    { id: 'analytics', label: 'تحليلات الاستخدام', icon: BarChart3, color: 'text-blue-600', activeBg: 'bg-blue-50 text-blue-700 border-r-4 border-blue-600' },
    { id: 'branches', label: 'الفروع', icon: Building2, color: 'text-blue-600', activeBg: 'bg-blue-50 text-blue-700 border-r-4 border-blue-600' },
    { id: 'avatars', label: 'متجر الأفتارات', icon: Store, color: 'text-teal-600', activeBg: 'bg-teal-50 text-teal-700 border-r-4 border-teal-600' },
    { id: 'features', label: 'الميزات الإضافية', icon: Zap, color: 'text-purple-600', activeBg: 'bg-purple-50 text-purple-700 border-r-4 border-purple-600' },
  ] as const;

  // Toast notification
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  // Notes form state
  const [complaintEmployee, setComplaintEmployee] = useState('');
  const [complaintText, setComplaintText] = useState('');
  const [safetyEmployee, setSafetyEmployee] = useState('');
  const [safetyText, setSafetyText] = useState('');

  // Add employee form
  const [newEmpName, setNewEmpName] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);

  const handleUpdateStats = (id: string, type: 'totalReviews' | 'monthReviews' | 'positive' | 'negative' | 'complaints' | 'safety', val: number) => {
    if (!recordsReady || !summaryReady) { showToast('انتظري اكتمال تحميل الملخص والبيانات قبل التعديل'); return; }
    const emp = users.find(u => u.id === id);
    if (!emp) return;
    
    const manual = emp.manualStats || {};
    let oldFinal = 0;
    if (type === 'totalReviews') oldFinal = emp.reviewsCount || 0;
    else if (type === 'monthReviews') oldFinal = emp.monthReviewsCount || 0;
    else oldFinal = emp.stats[type] || 0;
    
    const delta = val - oldFinal;
    const currentManual = manual[type] || 0;
    
    updateUser(id, { manualStats: { ...manual, [type]: currentManual + delta } });
    showToast('تم تحديث الإحصائيات');
  };

  const handleAddEmployee = () => {
    if (!newEmpName.trim()) return;
    const id = 'emp_' + Date.now();
    const branch = globalBranch;
    addUser({
      id, name: newEmpName.trim(), branch, isCoverage: branch === 'موظفة خارجية', email: '', role: 'employee', imageUrl: employeeImg,
      stats: { positive: 0, negative: 0, complaints: 0, safety: 0 }
    });
    setNewEmpName('');
    setShowAddForm(false);
    showToast('تمت إضافة الموظفة بنجاح');
  };

  const handleSubmitComplaint = () => {
    if (!recordsReady) { showToast('انتظري اكتمال المزامنة التلقائية قبل التسجيل'); return; }
    if (!globalBranch || !complaintEmployee || !complaintText) {
      showToast('يرجى ملء جميع الحقول');
      return;
    }
    const emp = employeesForBranch(globalBranch).find(u => u.id === complaintEmployee);
    if (!emp) return;
    updateUser(emp.id, { stats: { ...emp.stats, complaints: emp.stats.complaints + 1 } });
    addTimelineEvent({
      branch: globalBranch,
      type: 'gap',
      title: `شكوى عميل - ${emp.name}`,
      time: new Date().toLocaleTimeString('ar-SA-u-nu-latn', { hour: '2-digit', minute: '2-digit' }),
      comment: complaintText,
      employees: [{ id: emp.id, name: emp.name }],
    });
    setComplaintEmployee(''); setComplaintText('');
    showToast('تم تسجيل الشكوى بنجاح');
  };

  const handleSubmitSafety = () => {
    if (!recordsReady) { showToast('انتظري اكتمال المزامنة التلقائية قبل التسجيل'); return; }
    if (!globalBranch || !safetyEmployee || !safetyText) {
      showToast('يرجى ملء جميع الحقول');
      return;
    }
    const emp = employeesForBranch(globalBranch).find(u => u.id === safetyEmployee);
    if (!emp) return;
    updateUser(emp.id, { stats: { ...emp.stats, safety: emp.stats.safety + 1 } });
    addTimelineEvent({
      branch: globalBranch,
      type: 'gap',
      title: `مخالفة سلامة - ${emp.name}`,
      time: new Date().toLocaleTimeString('ar-SA-u-nu-latn', { hour: '2-digit', minute: '2-digit' }),
      comment: safetyText,
      employees: [{ id: emp.id, name: emp.name }],
    });
    setSafetyEmployee(''); setSafetyText('');
    showToast('تم تسجيل مخالفة السلامة');
  };

  const employeesForBranch = (branch: string) => users.filter(u => belongsToBranch(u, branch) && u.role === 'employee');

  return (
    <div className="workspace min-h-screen flex flex-col md:flex-row font-alexandria" dir="rtl">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] bg-green-600 text-white px-6 py-3 rounded-xl shadow-2xl flex items-center gap-2 animate-fade-in font-bold text-sm">
          <CheckCircle2 size={20} />
          {toast}
        </div>
      )}

      {/* Desktop Sidebar (visible on md:flex, hidden on mobile) */}
      <aside className="workspace-sidebar hidden md:flex flex-col w-64 lg:w-72 bg-white border-l border-slate-200 h-screen sticky top-0 shrink-0 z-40 shadow-sm">
        {/* Brand / Logo */}
        <div className="p-5 border-b border-slate-100">
          <Brand />
          <p className="mt-3 text-xs text-slate-500">لوحة الإدارة العامة</p>
        </div>

        {/* Navigation Items */}
        <nav aria-label="التنقل الرئيسي" className="workspace-nav flex-1 p-3 space-y-1 overflow-y-auto custom-scrollbar">
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                aria-current={isActive ? 'page' : undefined}
                data-usage-action="navigation" onClick={() => navigate(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 group text-right cursor-pointer ${
                  isActive
                    ? `${item.activeBg} shadow-sm font-extrabold`
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon size={18} className={isActive ? item.color : 'text-slate-400 group-hover:text-slate-600 transition-colors'} />
                  <span>{item.label}</span>
                </div>
              </button>
            );
          })}
        </nav>

        {/* User Info & Logout */}
        <div className="p-3.5 border-t border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2.5 mb-2.5">
            <div className="w-8 h-8 rounded-full bg-slate-800 text-white flex items-center justify-center font-bold text-xs shrink-0">
              م
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-800 truncate">مدير النظام العام</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <LeaderboardLink />
          <button
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-xl transition-colors cursor-pointer"
          >
            <LogOut size={14} />
            تسجيل الخروج
          </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 pb-28 md:pb-10">
        <div className="p-3 text-center">
        </div>
        {/* Mobile Header (hidden on md:) */}
        <header className="md:hidden bg-slate-800 text-white p-4 shadow-md sticky top-0 z-30">
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center font-black text-sm">
                S
              </div>
              <h1 className="text-base font-bold">لوحة الإدارة العامة</h1>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <LeaderboardLink className="text-slate-200 hover:bg-slate-700" />
            <button onClick={logout} className="p-1.5 hover:bg-slate-700 rounded-lg flex items-center gap-1.5 text-xs font-bold text-slate-200">
              <LogOut size={15} />
              خروج
            </button>
            </div>
          </div>

        </header>

        {/* Desktop Top Bar (hidden on mobile) */}
        <header className="workspace-topbar hidden md:flex bg-white/95 border-b border-slate-200 px-8 py-4 justify-between items-center sticky top-0 z-20 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-black text-slate-800">
              {navItems.find(i => i.id === activeTab)?.label}
            </h2>
            {globalBranch !== 'all' && (
              <span className="bg-blue-50 text-blue-700 text-xs font-extrabold px-3 py-1 rounded-full border border-blue-200 flex items-center gap-1.5">
                <Building2 size={13} />
                {globalBranch === 'موظفة خارجية' ? 'الموظفات المتنقلات' : `فرع ${globalBranch}`}
              </span>
            )}
          </div>

        </header>

        {/* Main Content */}
        <main className={activeTab === 'avatars' ? 'flex-1 w-full bg-white py-4' : 'flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full'}>

          <div className={activeTab === 'avatars' ? 'min-h-[65vh] bg-white' : 'workspace-panel min-h-[65vh] bg-white p-3 sm:p-5 md:p-8'}>



          {activeTab === 'branches' && !branchOpen && (
            <section className="mx-auto max-w-3xl space-y-5">
              <h1 className="text-2xl font-black text-slate-900">اختيار الفرع</h1>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {branches.map(branch => <button key={branch} onClick={() => openBranch(branch)}
                  className="flex min-h-24 flex-col items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-start font-bold text-slate-900 hover:border-blue-400 hover:bg-blue-50 focus-visible:ring-2 focus-visible:ring-blue-600">
                  <Building2 aria-hidden="true" className="text-blue-700" size={21} />
                  {branch}
                </button>)}
              </div>
              <button onClick={() => openBranch('موظفة خارجية')} className="min-h-11 rounded-xl border px-4 font-bold text-blue-800">الموظفات المتنقلات</button>
            </section>
          )}

          {branchOpen && (
            <header className="mb-5 space-y-4 border-b border-slate-200 pb-4">
              <div className="min-w-0">
                <h1 className="sr-only">{coverage ? 'الموظفات المتنقلات' : `فرع ${globalBranch}`}</h1>
                <nav aria-label="الفروع" className="grid grid-cols-6 gap-1 sm:gap-2">
                  {branches.map(branch => (
                    <button key={branch} type="button" aria-current={globalBranch === branch ? 'page' : undefined}
                      onClick={() => openBranch(branch)}
                      className={`min-h-11 min-w-0 rounded-xl border px-1 text-xs font-bold focus-visible:ring-2 focus-visible:ring-blue-600 sm:px-3 sm:text-sm ${globalBranch === branch ? 'border-blue-700 bg-blue-700 text-white' : 'border-slate-200 bg-white text-blue-800 hover:border-blue-400 hover:bg-blue-50'}`}>
                      {branch}
                    </button>
                  ))}
                </nav>
              </div>
              {!coverage && <nav aria-label="أقسام الفرع" className="grid grid-cols-5 gap-2">
                {([
                  ['calendar', 'التقويم', CalendarClock],
                  ['employees', 'الموظفات', Users],
                  ['reviews', 'التقييمات', BarChart3],
                  ['notes', 'الملاحظات والشكاوى', MessageSquareWarning],
                  ['settings', 'الإعدادات', Settings],
                ] as const).map(([id, label, Icon]) => (
                  <button key={id} type="button" aria-label={label} title={label} aria-current={branchView === id ? 'page' : undefined} onClick={() => { setBranchView(id); setOpenEmployeeId(null); }}
                    className={`flex min-h-11 items-center justify-center rounded-xl px-3 focus-visible:ring-2 focus-visible:ring-blue-600 ${branchView === id ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-700 hover:bg-blue-50'}`}>
                    <Icon size={20} aria-hidden="true" />
                  </button>
                ))}
              </nav>}
            </header>
          )}

          {branchOpen && branchView === 'settings' && <BranchesTab key={globalBranch} branch={globalBranch} showToast={showToast} />}
          {employeeView && (
            <section className="space-y-4">
              <button type="button" aria-expanded={showAddForm} onClick={() => setShowAddForm(value => !value)} className="action-primary inline-flex min-h-11 items-center gap-2"><PlusCircle size={17} /> إضافة موظفة</button>
              {showAddForm && (
                <div className="mb-6 p-4 bg-green-50 rounded-xl border border-green-200">
                  <h4 className="font-bold text-green-800 mb-3">إضافة موظفة جديدة إلى ({coverage ? 'الموظفات المتنقلات' : `فرع ${globalBranch}`})</h4>
                  <div className="flex flex-wrap gap-3">
                    <input aria-label="اسم الموظفة" type="text" placeholder="اسم الموظفة..." value={newEmpName} onChange={e => setNewEmpName(e.target.value)} className="min-w-0 flex-1 p-2 border rounded-lg" />
                    <button onClick={handleAddEmployee} className="bg-green-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-green-700">إضافة</button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {branchEmployees.map(emp => (
                  <details key={emp.id} name="branch-employee" onToggle={event => {
                    if (event.currentTarget.open) setOpenEmployeeId(emp.id);
                    else setOpenEmployeeId(id => id === emp.id ? null : id);
                  }} className="group min-w-0 self-start rounded-2xl border border-slate-200 bg-white shadow-sm open:border-blue-200">
                    <summary className="flex cursor-pointer list-none items-center gap-3 rounded-2xl p-4 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 [&::-webkit-details-marker]:hidden">
                      <EmployeeAvatar employee={emp} className="h-14 w-14 shrink-0 rounded-full border border-slate-200" />
                      <div className="min-w-0 flex-1">
                        <EmployeeIdentity employee={emp} className="text-slate-900"/>
                        {!reviewedIds.has(emp.id) && <span className="mt-1 inline-block rounded-md bg-amber-50 px-2 py-1 text-xs font-bold text-amber-900">حساب غير مفعل</span>}
                        <p className="mt-2 text-xs text-blue-700">إجمالي التقييمات: {emp.reviewsCount || 0} · الشهر: {emp.monthReviewsCount || 0}</p>
                      </div>
                      <span className="shrink-0 text-xs font-bold text-blue-700">
                        <span className="group-open:hidden">عرض التفاصيل +</span>
                        <span className="hidden group-open:inline">إغلاق −</span>
                      </span>
                    </summary>
                    {openEmployeeId === emp.id && <div className="grid grid-cols-1 gap-4 border-t border-slate-100 p-4 sm:grid-cols-2">
                          <div className="min-w-0 space-y-2">
                            <p className="text-sm font-bold text-slate-600">الاسم وإعدادات الحساب</p>

                          <input aria-label="الاسم وإعدادات الحساب" type="text" defaultValue={emp.name} onBlur={(e) => { updateUser(emp.id, { name: e.target.value }); showToast('تم تحديث الاسم'); }}
                            className="w-full p-1 border rounded bg-transparent focus:bg-white font-bold" />
                          <EmployeeAccountActions employee={emp} />

                          </div>
                          <div className="min-w-0 space-y-2">
                            <p className="text-sm font-bold text-slate-600">الفرع (نقل)</p>

                          <EmployeeTransfer employee={emp} />

                          </div>
                          <div className="min-w-0 space-y-2">
                            <p className="text-sm font-bold text-slate-600">إجمالي التقييمات</p>

                          <input aria-label="إجمالي التقييمات" type="number" defaultValue={emp.reviewsCount || 0}
                            onBlur={(e) => handleUpdateStats(emp.id, 'totalReviews', parseInt(e.target.value) || 0)}
                            className="w-full p-1 border rounded text-center focus:bg-white text-blue-600 font-bold text-xs" />

                          </div>
                          <div className="min-w-0 space-y-2">
                            <p className="text-sm font-bold text-slate-600">تقييمات الشهر</p>

                          <input aria-label="تقييمات الشهر" type="number" defaultValue={emp.monthReviewsCount || 0}
                            onBlur={(e) => handleUpdateStats(emp.id, 'monthReviews', parseInt(e.target.value) || 0)}
                            className="w-full p-1 border rounded text-center focus:bg-white text-blue-600 font-bold text-xs" />

                          </div>
                          <div className="min-w-0 space-y-2">
                            <p className="text-sm font-bold text-slate-600">نقاط إيجابية</p>

                          <input aria-label="نقاط إيجابية" type="number" step="0.25" defaultValue={emp.stats.positive}
                            onBlur={(e) => handleUpdateStats(emp.id, 'positive', parseFloat(e.target.value) || 0)}
                            className="w-full p-1 border rounded text-center focus:bg-white text-green-600 font-bold text-xs" />

                          </div>
                          <div className="min-w-0 space-y-2">
                            <p className="text-sm font-bold text-slate-600">رصيد جودة التقييمات (من 2)</p>

                          <input aria-label="رصيد جودة التقييمات من 2" type="number" step="0.5" defaultValue={emp.stats.negative}
                            onBlur={(e) => handleUpdateStats(emp.id, 'negative', parseFloat(e.target.value) || 0)}
                            className="w-full p-1 border rounded text-center focus:bg-white text-red-600 font-bold text-xs" />

                          </div>
                          <div className="min-w-0 space-y-2">
                            <p className="text-sm font-bold text-slate-600">الشكاوى</p>

                          <input aria-label="الشكاوى" type="number" defaultValue={emp.stats.complaints}
                            onBlur={(e) => handleUpdateStats(emp.id, 'complaints', parseInt(e.target.value) || 0)}
                            className="w-full p-1 border rounded text-center focus:bg-white text-orange-600 font-bold text-xs" />

                          </div>
                          <div className="min-w-0 space-y-2">
                            <p className="text-sm font-bold text-slate-600">السلامة</p>

                          <input aria-label="السلامة" type="number" defaultValue={emp.stats.safety}
                            onBlur={(e) => handleUpdateStats(emp.id, 'safety', parseInt(e.target.value) || 0)}
                            className="w-full p-1 border rounded text-center focus:bg-white text-orange-600 font-bold text-xs" />

                          </div>
                      <dl className="space-y-2 rounded-xl bg-slate-50 p-3 text-sm">
                        <div><dt className="font-bold">الفرع</dt><dd>{employeeBranchLabel(emp)}</dd></div>
                        {emp.code && <div><dt className="font-bold">رمز الموظفة</dt><dd>{emp.code}</dd></div>}
                        {Boolean(emp.assignedBranches?.length) && <div><dt className="font-bold">الفروع المسندة</dt><dd>{emp.assignedBranches?.join('، ')}</dd></div>}
                        {Boolean(emp.aliases?.length) && <div><dt className="font-bold">أسماء الربط</dt><dd>{emp.aliases?.join('، ')}</dd></div>}
                        <div><dt className="font-bold">النقاط</dt><dd>{emp.points ?? 0}</dd></div>
                        <div><dt className="font-bold">رصيد التقييمات</dt><dd>{emp.ordinaryReviewBalance ?? 0}</dd></div>
                      </dl>
                      <div className="space-y-3 sm:col-span-2">
                        <details className="rounded-xl border p-3">
                          <summary className="cursor-pointer font-bold">التقييمات المرتبطة</summary>
                          <ul className="mt-3 space-y-2">
                            {reviews.filter(review => review.linkedEmployeeIds.includes(emp.id)).sort(newestFirst).map(review => (
                              <li key={review.id} className="rounded-lg bg-slate-50 p-3 text-sm">
                                <strong>{review.branch} · {review.date} · {review.rating}</strong>
                                <p>{review.comment}</p>
                              </li>
                            ))}
                          </ul>
                          {!reviewedIds.has(emp.id) && <p className="mt-2 text-sm text-slate-600">لا توجد تقييمات.</p>}
                        </details>
                        <details className="rounded-xl border p-3">
                          <summary className="cursor-pointer font-bold">الشفتات والملاحظات</summary>
                          <ul className="mt-3 space-y-2">
                            {timeline.filter(event => event.employees?.some(employee => employee.id === emp.id) ||
                              (!event.employees?.length && event.branch === emp.branch &&
                                (event.title === `شكوى عميل - ${emp.name}` || event.title === `مخالفة سلامة - ${emp.name}`))).sort(newestFirst).map(event => (
                              <li key={event.id} className="rounded-lg bg-slate-50 p-3 text-sm">
                                <strong>{event.title}</strong>
                                <p>{event.branch} · {event.date} · {event.time}{event.endTime && ` – ${event.endTime}`}</p>
                                {event.comment && <p>{event.comment}</p>}
                              </li>
                            ))}
                          </ul>
                        </details>
                      </div>
                    </div>}
                  </details>
                ))}
              </div>
              {(!recordsReady || !summaryReady || syncError) && <p role="status">{syncError ? 'تعذر تحميل السجلات.' : 'جارٍ تحميل السجلات…'}</p>}
              {recordsReady && summaryReady && !syncError && branchEmployees.length === 0 && (
                <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-slate-500">لا توجد موظفات في هذا الفرع.</p>
              )}
            </section>
          )}

          {branchOpen && branchView === 'notes' && (
            <div>
              <div className="flex items-center gap-3 mb-4">
                <h2 className="text-lg font-bold text-gray-800">الملاحظات والشكاوى</h2>
              </div>
              <ResultReportsInbox key={globalBranch} branch={globalBranch} />
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                {/* Complaints Form */}
                <div className="bg-red-50 p-6 rounded-xl border border-red-100 shadow-sm">
                  <div className="flex items-center gap-2 mb-4">
                    <AlertOctagon className="text-red-500" />
                    <h3 className="font-bold text-red-700 text-lg">تسجيل شكوى عميل</h3>
                  </div>
                  <div className="space-y-3">
                    <select aria-label="موظفة الشكوى" value={complaintEmployee} onChange={e => setComplaintEmployee(e.target.value)} className="w-full p-2 border rounded-lg bg-white">
                      <option value="">الموظفة...</option>
                      {globalBranch && employeesForBranch(globalBranch).map(e => <option key={e.id} value={e.id}>{e.name} — {summaryReady ? arabicReviewCount(e.reviewsCount) : '…'}</option>)}
                    </select>
                    <textarea placeholder="تفاصيل الشكوى..." value={complaintText} onChange={e => setComplaintText(e.target.value)} className="w-full p-2 border rounded-lg bg-white h-24"></textarea>
                    <button onClick={handleSubmitComplaint} className="w-full bg-red-600 text-white py-2 rounded-lg font-bold hover:bg-red-700">اعتماد الشكوى وخصم النقاط</button>
                  </div>
                </div>

                {/* Safety Form */}
                <div className="bg-orange-50 p-6 rounded-xl border border-orange-100 shadow-sm">
                  <div className="flex items-center gap-2 mb-4">
                    <ShieldAlert className="text-orange-500" />
                    <h3 className="font-bold text-orange-700 text-lg">تسجيل مخالفة سلامة</h3>
                  </div>
                  <div className="space-y-3">
                    <select aria-label="موظفة المخالفة" value={safetyEmployee} onChange={e => setSafetyEmployee(e.target.value)} className="w-full p-2 border rounded-lg bg-white">
                      <option value="">الموظفة...</option>
                      {globalBranch && employeesForBranch(globalBranch).map(e => <option key={e.id} value={e.id}>{e.name} — {summaryReady ? arabicReviewCount(e.reviewsCount) : '…'}</option>)}
                    </select>
                    <textarea placeholder="وصف المخالفة..." value={safetyText} onChange={e => setSafetyText(e.target.value)} className="w-full p-2 border rounded-lg bg-white h-24"></textarea>
                    <button onClick={handleSubmitSafety} className="w-full bg-orange-600 text-white py-2 rounded-lg font-bold hover:bg-orange-700">اعتماد المخالفة</button>
                  </div>
                </div>
              </div>

              <h3 className="font-bold text-lg mb-4 text-gray-800 border-b pb-2">السجل الأخير</h3>
              <div className="grid gap-4">
                {timeline.filter(t => t.branch === globalBranch && (t.title.includes('شكوى') || t.title.includes('سلامة') || t.title.includes('مخالفة'))).sort(newestFirst).slice(0, 15).map(t => (
                  <div key={t.id} className={`p-4 rounded-xl border flex items-start justify-between gap-4 ${t.title.includes('شكوى') ? 'bg-red-50 border-red-100' : 'bg-orange-50 border-orange-100'}`}>
                    <div className="flex items-start gap-4 flex-1">
                      {t.title.includes('شكوى') ? <AlertOctagon className="text-red-500 shrink-0 mt-1" /> : <ShieldAlert className="text-orange-500 shrink-0 mt-1" />}
                      <div className="flex-1 w-full">
                        {editingNoteId === t.id ? (
                          <div className="space-y-2 w-full pr-2">
                            <input 
                              type="text" 
                              value={editingNoteTitle} 
                              onChange={e => setEditingNoteTitle(e.target.value)} 
                              className="w-full p-2 border rounded text-sm" 
                            />
                            <textarea 
                              value={editingNoteComment} 
                              onChange={e => setEditingNoteComment(e.target.value)} 
                              className="w-full p-2 border rounded text-sm min-h-[80px]" 
                            />
                            <div className="flex gap-2">
                              <button onClick={() => {
                                updateTimelineEvent(t.id, { title: editingNoteTitle, comment: editingNoteComment });
                                setEditingNoteId(null);
                                showToast('تم تحديث الملاحظة');
                              }} className="px-3 py-1 bg-green-600 text-white rounded text-xs">حفظ</button>
                              <button onClick={() => setEditingNoteId(null)} className="px-3 py-1 bg-gray-500 text-white rounded text-xs">إلغاء</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <h3 className={`font-bold ${t.title.includes('شكوى') ? 'text-red-700' : 'text-orange-700'}`}>{t.title}</h3>
                            <p className="text-gray-600 text-sm mt-1">{t.comment}</p>
                            <p className="text-xs text-gray-400 mt-2">{formatTime(t.time)} • {t.branch}</p>
                          </>
                        )}
                      </div>
                    </div>
                    {editingNoteId !== t.id && (
                      <div className="flex gap-2 opacity-50 hover:opacity-100 transition-opacity shrink-0">
                        <button onClick={() => {
                          setEditingNoteId(t.id);
                          setEditingNoteTitle(t.title);
                          setEditingNoteComment(t.comment || '');
                        }} className="text-blue-600 hover:text-blue-800 p-1 bg-blue-100 rounded">
                          <Edit size={16} />
                        </button>
                        <button onClick={() => {
                          if (confirm('هل أنت متأكد من حذف هذه الملاحظة؟')) {
                            deleteTimelineEvent(t.id);
                            showToast('تم الحذف بنجاح');
                          }
                        }} className="text-red-600 hover:text-red-800 p-1 bg-red-100 rounded">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                {timeline.filter(t => t.title.includes('شكوى') || t.title.includes('سلامة') || t.title.includes('مخالفة')).length === 0 && (
                  <p className="text-center text-gray-500 py-8">لا توجد ملاحظات مسجلة بعد.</p>
                )}
              </div>
            </div>
          )}

          {branchOpen && branchView === 'reviews' && <ReviewsTab key={globalBranch} branch={globalBranch} />}
          {branchOpen && branchView === 'calendar' && <AdminShiftCalendar key={globalBranch} branch={globalBranch} />}

          {activeTab === 'analytics' && <UsageAnalytics branch={analyticsBranch} onBranchChange={setAnalyticsBranch} />}
          {activeTab === 'avatars' && <AvatarStoreAdmin />}

          {/* Windsor.ai Integration Tab */}
          {activeTab === 'features' && (
            <section className="bg-white rounded-3xl border p-6 space-y-4" dir="rtl">
              <AdditionalFeaturesSettings />
              <details className="border-t pt-5"><summary className="cursor-pointer font-bold">حالة تكامل Windsor.ai</summary>
              <h2 className="text-2xl font-black">مزامنة تقييمات قوقل</h2>
              <p>تُفحص التقييمات الجديدة دوريًا طوال اليوم. يعتمد وصولها على وقت إتاحتها من قوقل وفترة تحديث Windsor، وقد يتأخر تشغيل مهمة الجلب.</p>
              <p>تُحفظ البيانات في Supabase وتُربط بالشفتات المسجلة. يحتفظ المتصفح بالنتائج ويستقبل إصدار البيانات الجديد تلقائيًا.</p>
              <p>تُدار بيانات الاتصال في الخادم. لا يحتاج هذا المتصفح إلى مفتاح Windsor.</p>
              <a href="https://github.com/shabih11/rev4/actions/workflows/windsor-sync.yml" target="_blank" rel="noreferrer" className="text-blue-700 underline">حالة المزامنة</a></details>
            </section>
          )}

          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation (visible only on mobile: md:hidden) */}
      <nav aria-label="التنقل الرئيسي" className="bottom-nav md:hidden fixed bottom-0 left-0 right-0 w-full bg-white/95 backdrop-blur-lg border-t border-slate-200 shadow-[0_-10px_30px_-10px_rgba(0,0,0,0.1)] z-50 px-2 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex overflow-x-auto gap-1 items-center custom-scrollbar">
        {navItems.map(item => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              aria-current={isActive ? 'page' : undefined}
              data-usage-action="navigation" onClick={() => navigate(item.id)}
              className={`shrink-0 min-w-[65px] flex-1 flex flex-col items-center justify-center gap-1 py-1.5 rounded-xl transition-all duration-200 ${
                isActive
                  ? `${item.activeBg} scale-105 font-bold`
                  : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Icon size={20} className={isActive ? item.color : ''} />
              <span className="text-[10px] leading-tight font-bold">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};
