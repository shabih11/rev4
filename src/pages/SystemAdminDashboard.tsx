import { BranchesTab } from '../components/admin/BranchesTab';
import { ReviewsTab } from '../components/admin/ReviewsTab';
import { EmployeeTransfer } from '../components/EmployeeTransfer';
import { ResultReportsInbox } from '../components/ResultReportsInbox';
import { AdminShiftCalendar } from '../components/AdminShiftCalendar';
import { arabicReviewCount } from '../lib/arabicReviewCount';
import { EmployeeIdentity } from '../components/EmployeeIdentity';
import { EmployeeAvatar } from '../components/EmployeeFeatures';
import { AdditionalFeaturesSettings } from '../components/AdditionalFeaturesSettings';
import { EmployeeAccountActions } from '../components/EmployeeAccountActions';
import { MergeAccountPicker } from '../components/MergeAccountPicker';
import { BranchEmployees } from '../components/BranchEmployees';
import { Brand } from '../components/Brand';
import { DisabledEmployees } from '../components/DisabledEmployees';
import { EmployeeManagementActions } from '../components/EmployeeManagementActions';
import { belongsToBranch, isCoverageEmployee, employeeSelectionBranch } from '../lib/employeeBranches';
import { LeaderboardLink } from '../components/LeaderboardLink';
import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useRecordScope } from '../hooks/useRecordScope';
import { AlertOctagon, ShieldAlert, Users, LogOut, Building2, CalendarClock, MessageSquareWarning, PlusCircle, CheckCircle2, BarChart3, Trash2, Edit, Zap, GitMerge } from 'lucide-react';
import employeeImg from '../assets/employee.png';
import { formatTime } from '../lib/formatDate';
import { newestFirst } from '../lib/employeeActivity';

export const SystemAdminDashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const { recordsReady, summaryReady, users, updateUser, addUser, setEmployeeDisabled, mergeEmployees, timeline, addTimelineEvent, updateTimelineEvent, deleteTimelineEvent } = useData();
  const [activeTab, setActiveTab] = useState<'shifts' | 'branches' | 'employees' | 'notes' | 'stats' | 'features'>('shifts');
  
  const branches = ['جاليري', 'ذافيو', 'سلام', 'القصر', 'المملكة', 'شرق'];
  const [globalBranch, setGlobalBranch] = useState<string>('all');
  const [selectedBranch, setSelectedBranch] = useState(branches[0]);
  const [selectedTimelineBranch, setSelectedTimelineBranch] = useState(branches[0]);
  
  const handleGlobalBranchChange = (branch: string) => {
    setGlobalBranch(branch);
    if (branch !== 'all') {
      setSelectedBranch(branch);
      setSelectedTimelineBranch(branch);
      if (branch !== 'موظفة خارجية') {
        setComplaintBranch(branch);
        setSafetyBranch(branch);
      }
    }
  };

  const effectiveBranch = globalBranch !== 'all' ? globalBranch : selectedBranch;
  const effectiveTimelineBranch = globalBranch !== 'all' ? globalBranch : selectedTimelineBranch;

  const branchEmployees = users.filter(u => (effectiveBranch === 'موظفة خارجية' ? isCoverageEmployee(u) : belongsToBranch(u, effectiveBranch)) && u.role === 'employee');

  // Merge Employees State
  const [showMergeModal, setShowMergeModal] = useState(false);
  const needsAllRecords = showMergeModal;
  useRecordScope({
    users: activeTab === 'employees' || activeTab === 'stats' || activeTab === 'notes' || activeTab === 'shifts',
    reviews: needsAllRecords ? { all: true } : activeTab === 'shifts' || activeTab === 'stats' ? { branches: [effectiveTimelineBranch] } : undefined,
    timeline: needsAllRecords || (activeTab === 'notes' && globalBranch === 'all') ? { all: true }
      : activeTab === 'shifts' || activeTab === 'stats' || activeTab === 'notes' ? { branches: [effectiveTimelineBranch] } : undefined,
  });
  const [primaryEmpId, setPrimaryEmpId] = useState('');
  const [duplicateEmpId, setDuplicateEmpId] = useState('');
  const [primaryMergeBranch, setPrimaryMergeBranch] = useState('');
  const [duplicateMergeBranch, setDuplicateMergeBranch] = useState('');
  const [mergedCoverage, setMergedCoverage] = useState(false);
  const [mergedName, setMergedName] = useState('');
  const [mergedBranch, setMergedBranch] = useState(branches[0]);
  
  const [viewingReviewsMonth, setViewingReviewsMonth] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteTitle, setEditingNoteTitle] = useState('');
  const [editingNoteComment, setEditingNoteComment] = useState('');

  const navItems = [
    { id: 'shifts', label: 'الشفتات', icon: CalendarClock, color: 'text-indigo-600', activeBg: 'bg-indigo-50 text-indigo-700 border-r-4 border-indigo-600' },
    { id: 'employees', label: 'الموظفات', icon: Users, color: 'text-emerald-600', activeBg: 'bg-emerald-50 text-emerald-700 border-r-4 border-emerald-600' },
    { id: 'branches', label: 'الفروع', icon: Building2, color: 'text-blue-600', activeBg: 'bg-blue-50 text-blue-700 border-r-4 border-blue-600' },
    { id: 'stats', label: 'التقييمات', icon: BarChart3, color: 'text-blue-600', activeBg: 'bg-blue-50 text-blue-700 border-r-4 border-blue-600' },
    { id: 'notes', label: 'الملاحظات', icon: MessageSquareWarning, color: 'text-amber-600', activeBg: 'bg-amber-50 text-amber-700 border-r-4 border-amber-600' },
    { id: 'features', label: 'الميزات الإضافية', icon: Zap, color: 'text-purple-600', activeBg: 'bg-purple-50 text-purple-700 border-r-4 border-purple-600' },
  ] as const;

  // Toast notification
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  // Notes form state
  const [complaintBranch, setComplaintBranch] = useState('');
  const [complaintEmployee, setComplaintEmployee] = useState('');
  const [complaintText, setComplaintText] = useState('');
  const [safetyBranch, setSafetyBranch] = useState('');
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

  // handleSaveTimes was moved inline into the branch list map

  const handleAddEmployee = () => {
    if (!newEmpName.trim()) return;
    const id = 'emp_' + Date.now();
    const branch = effectiveBranch === 'موظفة خارجية' ? 'موظفة خارجية' : effectiveBranch;
    addUser({
      id, name: newEmpName.trim(), branch, isCoverage: branch === 'موظفة خارجية', email: '', role: 'employee', imageUrl: employeeImg,
      stats: { positive: 0, negative: 0, complaints: 0, safety: 0 }
    });
    setNewEmpName('');
    setShowAddForm(false);
    showToast('تمت إضافة الموظفة بنجاح');
  };

  const handleRemoveEmployee = async (id: string) => {
    if (!confirm('هل تريدين تعطيل الموظفة مع الاحتفاظ بسجلاتها؟')) return;
    const removed = await setEmployeeDisabled(id, true);
    showToast(removed ? 'تم تعطيل الموظفة' : 'تعذر التعطيل. تحققي من الاتصال وتحديث قاعدة البيانات.');
  };

  const handleSubmitComplaint = () => {
    if (!recordsReady) { showToast('انتظري اكتمال المزامنة التلقائية قبل التسجيل'); return; }
    if (!complaintBranch || !complaintEmployee || !complaintText) {
      showToast('يرجى ملء جميع الحقول');
      return;
    }
    const emp = users.find(u => u.name === complaintEmployee);
    if (emp) {
      updateUser(emp.id, { stats: { ...emp.stats, complaints: emp.stats.complaints + 1 } });
    }
    addTimelineEvent({
      branch: complaintBranch,
      type: 'gap',
      title: `شكوى عميل - ${complaintEmployee}`,
      time: new Date().toLocaleTimeString('ar-SA-u-nu-latn', { hour: '2-digit', minute: '2-digit' }),
      comment: complaintText,
    });
    setComplaintBranch(''); setComplaintEmployee(''); setComplaintText('');
    showToast('تم تسجيل الشكوى بنجاح');
  };

  const handleSubmitSafety = () => {
    if (!recordsReady) { showToast('انتظري اكتمال المزامنة التلقائية قبل التسجيل'); return; }
    if (!safetyBranch || !safetyEmployee || !safetyText) {
      showToast('يرجى ملء جميع الحقول');
      return;
    }
    const emp = users.find(u => u.name === safetyEmployee);
    if (emp) {
      updateUser(emp.id, { stats: { ...emp.stats, safety: emp.stats.safety + 1 } });
    }
    addTimelineEvent({
      branch: safetyBranch,
      type: 'gap',
      title: `مخالفة سلامة - ${safetyEmployee}`,
      time: new Date().toLocaleTimeString('ar-SA-u-nu-latn', { hour: '2-digit', minute: '2-digit' }),
      comment: safetyText,
    });
    setSafetyBranch(''); setSafetyEmployee(''); setSafetyText('');
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

        {/* Global Branch Filter in Sidebar */}
        <div className="p-4 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Building2 size={15} className="text-blue-600" />
              تحديد الفرع
            </span>
            {globalBranch !== 'all' && (
              <button
                onClick={() => handleGlobalBranchChange('all')}
                className="text-[11px] text-blue-600 hover:text-blue-800 hover:underline font-bold"
              >
                عرض الكل
              </button>
            )}
          </div>
          <select
            value={globalBranch}
            onChange={(e) => handleGlobalBranchChange(e.target.value)}
            className="w-full bg-white border border-slate-200 text-slate-800 font-bold text-xs rounded-xl p-2.5 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer transition-all"
          >
            <option value="all">جميع الفروع</option>
            {branches.map(b => (
              <option key={b} value={b}>فرع {b}</option>
            ))}
            <option value="موظفة خارجية">الموظفات المتنقلات</option>
          </select>
          {globalBranch !== 'all' ? (
            <p className="text-[11px] text-blue-700 font-medium mt-2 bg-blue-50/80 border border-blue-100 rounded-lg p-1.5 text-center leading-relaxed">
              كافة التبويبات مخصصة لـ <strong>{globalBranch === 'موظفة خارجية' ? 'الموظفات المتنقلات' : `فرع ${globalBranch}`}</strong>
            </p>
          ) : (
            <p className="text-[11px] text-slate-400 font-medium mt-1.5 text-center">
              يتم عرض بيانات جميع الفروع
            </p>
          )}
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
                onClick={() => setActiveTab(item.id as any)}
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
              <p className="text-[10px] text-slate-400 font-mono truncate" dir="ltr">{user?.email}</p>
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

          {/* Mobile Global Branch Selector */}
          <div className="bg-slate-700/70 p-2 rounded-xl flex items-center gap-2">
            <Building2 size={15} className="text-blue-400 shrink-0" />
            <span className="text-xs text-slate-300 font-bold shrink-0">تحديد الفرع:</span>
            <select
              value={globalBranch}
              onChange={(e) => handleGlobalBranchChange(e.target.value)}
              className="flex-1 bg-slate-800 border border-slate-600 text-white text-xs font-bold rounded-lg p-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
            >
              <option value="all">جميع الفروع</option>
              {branches.map(b => (
                <option key={b} value={b}>فرع {b}</option>
              ))}
              <option value="موظفة خارجية">الموظفات المتنقلات</option>
            </select>
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

          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500 font-bold">
              تصفية الفرع:
            </span>
            <select
              value={globalBranch}
              onChange={(e) => handleGlobalBranchChange(e.target.value)}
              className="bg-slate-50 border border-slate-200 text-slate-800 font-bold text-xs rounded-xl px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              <option value="all">جميع الفروع</option>
              {branches.map(b => (
                <option key={b} value={b}>فرع {b}</option>
              ))}
              <option value="موظفة خارجية">الموظفات المتنقلات</option>
            </select>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full">
          <div className="workspace-heading"><h2>{navItems.find(i => i.id === activeTab)?.label}</h2><p>مساحة واحدة لتنظيم الفريق ومتابعة أثره.</p></div>
          <div className="workspace-panel bg-white p-5 md:p-8 overflow-x-auto min-h-[75vh]">
          


          {activeTab === 'branches' && <BranchesTab globalBranch={globalBranch} branches={branches} showToast={showToast} />}

          {activeTab === 'employees' && (
            <div>
              <BranchEmployees onReview={request => { setPrimaryEmpId(request.primaryId); setDuplicateEmpId(request.duplicateId); setPrimaryMergeBranch(employeeSelectionBranch(users.find(item => item.id === request.primaryId))); setDuplicateMergeBranch(employeeSelectionBranch(users.find(item => item.id === request.duplicateId))); setMergedCoverage(request.isCoverage); setMergedName(request.name); setMergedBranch(request.targetBranch); setShowMergeModal(true); }} />
              <div className="flex justify-between items-center mb-4 border-b pb-2 flex-wrap gap-2">
                <h2 className="text-xl font-bold">إدارة الموظفات</h2>
                <div className="flex gap-2 items-center flex-wrap">
                  <button onClick={() => setShowAddForm(!showAddForm)} className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 text-sm font-bold flex gap-2 items-center">
                    <PlusCircle size={16} /> إضافة موظفة
                  </button>
                  <EmployeeManagementActions />
                </div>
              </div>

              <DisabledEmployees />

              {/* Merge Employees Modal */}
              {showMergeModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
                  <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
                    <div className="flex items-center justify-between border-b pb-3 mb-4">
                      <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <GitMerge className="text-purple-600" size={20} />
                        دمج وتوحيد حساب موظفتين
                      </h3>
                      <button onClick={() => setShowMergeModal(false)} className="text-slate-400 hover:text-slate-600 font-bold text-lg">✕</button>
                    </div>

                    <p className="text-xs text-slate-600 mb-4 bg-purple-50 p-3 rounded-xl border border-purple-100 leading-relaxed">
                      عند اختلاف كتابة الاسم بين الفروع أو في بيانات Windsor (مثل الهمزات أو الاختصارات)، يتيح هذا الخيار دمج تقييمات وشفتات الموظفة المكررة في الحساب المعتمد وحذف السجل الإضافي.
                    </p>

                    <div className="space-y-4 text-xs font-bold text-slate-700">
                      <MergeAccountPicker label="الحساب الأساسي" branch={primaryMergeBranch} onBranchChange={value => { setPrimaryMergeBranch(value); setPrimaryEmpId(''); setMergedName(''); }} value={primaryEmpId} onChange={id => {
                        setPrimaryEmpId(id); if (duplicateEmpId === id) setDuplicateEmpId('');
                        const employee = users.find(item => item.id === id);
                        if (employee) { setMergedName(employee.name); setMergedBranch(employeeSelectionBranch(employee)); setMergedCoverage(isCoverageEmployee(employee)); }
                      }} users={users} ready={summaryReady} />
                      <MergeAccountPicker label="الحساب المكرر" branch={duplicateMergeBranch} onBranchChange={value => { setDuplicateMergeBranch(value); setDuplicateEmpId(''); }} value={duplicateEmpId} onChange={setDuplicateEmpId} excludedId={primaryEmpId} users={users} ready={summaryReady} />
                      <label className="flex items-center gap-3 rounded-xl bg-blue-50 p-4 text-sm"><input type="checkbox" checked={mergedCoverage} onChange={event => setMergedCoverage(event.target.checked)} className="h-5 w-5 accent-blue-700" />وسم موظفة متنقلة بعد الدمج</label>

                      <div>
                        <label className="block mb-1">3. الاسم الموحد المعتمد:</label>
                        <input 
                          type="text" 
                          value={mergedName} 
                          onChange={e => setMergedName(e.target.value)}
                          placeholder="الاسم الموحد الجديد..."
                          className="w-full p-2.5 border rounded-xl bg-white text-sm"
                        />
                      </div>

                      <div>
                        <label className="block mb-1">4. الفرع المعتمد:</label>
                        <select 
                          value={mergedBranch} 
                          onChange={e => setMergedBranch(e.target.value)}
                          className="w-full p-2.5 border rounded-xl bg-slate-50 text-sm font-medium"
                        >
                          {branches.map(b => (
                            <option key={b} value={b}>فرع {b}</option>
                          ))}
                          <option value="موظفة خارجية">موظفة متنقلة</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex gap-2 mt-6">
                      <button
                        disabled={!recordsReady}
                        onClick={async () => {
                          if (!primaryEmpId || !duplicateEmpId || !mergedName.trim()) {
                            showToast('يرجى اختيار الموظفتين وتحديد الاسم الموحد');
                            return;
                          }
                          if (primaryEmpId === duplicateEmpId) {
                            showToast('لا يمكن دمج الموظفة مع نفسها');
                            return;
                          }
                          if (!await mergeEmployees(primaryEmpId, duplicateEmpId, mergedName.trim(), mergedBranch, mergedCoverage)) return;
                          setShowMergeModal(false);
                          setPrimaryEmpId('');
                          setDuplicateEmpId('');
                          setMergedName('');
                          showToast('تم دمج الموظفتين وتوحيد كافة التقييمات بنجاح');
                        }}
                        className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white p-3 rounded-xl font-bold text-sm shadow-md transition"
                      >
                        تأكيد الدمج والتوحيد
                      </button>
                      <button
                        onClick={() => setShowMergeModal(false)}
                        className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-5 py-3 rounded-xl font-bold text-sm transition"
                      >
                        إلغاء
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {showAddForm && (
                <div className="mb-6 p-4 bg-green-50 rounded-xl border border-green-200">
                  <h4 className="font-bold text-green-800 mb-3">إضافة موظفة جديدة إلى ({selectedBranch === 'موظفة خارجية' ? 'الموظفات المتنقلات' : `فرع ${selectedBranch}`})</h4>
                  <div className="flex gap-3">
                    <input type="text" placeholder="اسم الموظفة..." value={newEmpName} onChange={e => setNewEmpName(e.target.value)} className="flex-1 p-2 border rounded-lg" />
                    <button onClick={handleAddEmployee} className="bg-green-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-green-700">إضافة</button>
                  </div>
                </div>
              )}

              {globalBranch === 'all' && (
                <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
                  {branches.map(b => (
                    <button key={b} onClick={() => setSelectedBranch(b)}
                      className={`px-4 py-2 rounded-lg font-bold whitespace-nowrap ${selectedBranch === b ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                    >فرع {b}</button>
                  ))}
                  <button onClick={() => setSelectedBranch('موظفة خارجية')}
                    className={`px-4 py-2 rounded-lg font-bold whitespace-nowrap ${selectedBranch === 'موظفة خارجية' ? 'bg-purple-600 text-white' : 'bg-purple-50 text-purple-700 hover:bg-purple-100'}`}
                  >الموظفات المتنقلات</button>
                </div>
              )}

              <h3 className="font-bold text-lg mb-4 text-gray-800">
                {effectiveBranch === 'موظفة خارجية' ? 'الموظفات المتنقلات' : `موظفات فرع ${effectiveBranch}`} ({branchEmployees.length})
              </h3>

              {effectiveBranch !== 'موظفة خارجية' && (
                <div className="mb-5 p-4 bg-blue-50 border border-blue-100 rounded-xl">
                  <h4 className="font-bold text-blue-900 mb-2">الموظفات المرتبطات بالفرع — {effectiveBranch} ({users.filter(account => account.role === 'employee' && belongsToBranch(account, effectiveBranch)).length})</h4>
                  <p className="text-sm text-blue-800">{users.filter(account => account.role === 'employee' && belongsToBranch(account, effectiveBranch)).map(person => person.name + (person.code ? ` (${person.code})` : '')).join('، ')}</p>
                  <p className="text-xs text-gray-600 mt-2">تظهر الموظفة المتنقلة في آخر فرع بدأ فيه شفت مسجّل لها. تبقى سجلات الفروع السابقة محفوظة.</p>
                </div>
              )}

              {selectedBranch === 'موظفة خارجية' && (
                <p className="text-sm text-purple-600 mb-4 bg-purple-50 p-3 rounded-lg border border-purple-100">
                  الموظفات المتنقلات يمكن أن يعملن في أي فرع ويجمعن تقييمات من عدة فروع.
                </p>
              )}
              
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {branchEmployees.map(emp => (
                  <details key={emp.id} className="group min-w-0 self-start rounded-2xl border border-slate-200 bg-white shadow-sm open:border-blue-200">
                    <summary className="flex cursor-pointer list-none items-center gap-3 rounded-2xl p-4 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 [&::-webkit-details-marker]:hidden">
                      <EmployeeAvatar employee={emp} className="h-14 w-14 shrink-0 rounded-full border border-slate-200" />
                      <div className="min-w-0 flex-1">
                        <EmployeeIdentity employee={emp} className="text-slate-900"/>
                        <p className="mt-2 text-xs text-blue-700">إجمالي التقييمات: {emp.reviewsCount || 0} · الشهر: {emp.monthReviewsCount || 0}</p>
                      </div>
                      <span className="shrink-0 text-xs font-bold text-blue-700">
                        <span className="group-open:hidden">عرض التفاصيل +</span>
                        <span className="hidden group-open:inline">إغلاق −</span>
                      </span>
                    </summary>
                    <div className="grid grid-cols-1 gap-4 border-t border-slate-100 p-4 sm:grid-cols-2">
                          <div className="min-w-0 space-y-2">
                            <p className="text-sm font-bold text-slate-600">صورة الموظفة</p>
                            <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-gray-200 bg-gray-50">
                              <img src={employeeImg} alt={emp.name} className="w-full h-full object-cover" />
                            </div>
                          </div>
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
                          <div className="min-w-0 space-y-2">
                            <p className="text-sm font-bold text-slate-600">إجراءات الموظفة</p>

                          <div className="flex flex-col gap-1.5 items-center justify-center">
                            <button onClick={() => handleRemoveEmployee(emp.id)} className="text-xs text-red-600 hover:underline font-bold">تعطيل</button>
                          </div>

                          </div>
                    </div>
                  </details>
                ))}
              </div>
              {branchEmployees.length === 0 && (
                <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-slate-500">لا توجد موظفات في هذا الفرع.</p>
              )}
            </div>
          )}

          {activeTab === 'notes' && (
            <div>
              <div className="flex items-center gap-3 mb-6 border-b pb-4">
                <MessageSquareWarning className="text-gray-800" size={28} />
                <h2 className="text-2xl font-bold text-gray-800">إدارة الملاحظات</h2>
              </div>
              <ResultReportsInbox />
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                {/* Complaints Form */}
                <div className="bg-red-50 p-6 rounded-xl border border-red-100 shadow-sm">
                  <div className="flex items-center gap-2 mb-4">
                    <AlertOctagon className="text-red-500" />
                    <h3 className="font-bold text-red-700 text-lg">تسجيل شكوى عميل</h3>
                  </div>
                  <div className="space-y-3">
                    <select value={complaintBranch} onChange={e => setComplaintBranch(e.target.value)} className="w-full p-2 border rounded-lg bg-white">
                      <option value="">اختر الفرع...</option>
                      {branches.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                    <select value={complaintEmployee} onChange={e => setComplaintEmployee(e.target.value)} className="w-full p-2 border rounded-lg bg-white">
                      <option value="">الموظفة...</option>
                      {complaintBranch && employeesForBranch(complaintBranch).map(e => <option key={e.id} value={e.name}>{e.name} — {summaryReady ? arabicReviewCount(e.reviewsCount) : '…'}</option>)}
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
                    <select value={safetyBranch} onChange={e => setSafetyBranch(e.target.value)} className="w-full p-2 border rounded-lg bg-white">
                      <option value="">اختر الفرع...</option>
                      {branches.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                    <select value={safetyEmployee} onChange={e => setSafetyEmployee(e.target.value)} className="w-full p-2 border rounded-lg bg-white">
                      <option value="">الموظفة...</option>
                      {safetyBranch && employeesForBranch(safetyBranch).map(e => <option key={e.id} value={e.name}>{e.name} — {summaryReady ? arabicReviewCount(e.reviewsCount) : '…'}</option>)}
                    </select>
                    <textarea placeholder="وصف المخالفة..." value={safetyText} onChange={e => setSafetyText(e.target.value)} className="w-full p-2 border rounded-lg bg-white h-24"></textarea>
                    <button onClick={handleSubmitSafety} className="w-full bg-orange-600 text-white py-2 rounded-lg font-bold hover:bg-orange-700">اعتماد المخالفة</button>
                  </div>
                </div>
              </div>

              <h3 className="font-bold text-lg mb-4 text-gray-800 border-b pb-2">السجل الأخير</h3>
              <div className="grid gap-4">
                {timeline.filter(t => (globalBranch !== 'all' ? t.branch === globalBranch : true) && (t.title.includes('شكوى') || t.title.includes('سلامة') || t.title.includes('مخالفة'))).sort(newestFirst).slice(0, 15).map(t => (
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

          {activeTab === 'stats' && <ReviewsTab globalBranch={globalBranch} branches={branches}
            selectedTimelineBranch={selectedTimelineBranch} effectiveTimelineBranch={effectiveTimelineBranch}
            viewingReviewsMonth={viewingReviewsMonth} setSelectedTimelineBranch={setSelectedTimelineBranch}
            setViewingReviewsMonth={setViewingReviewsMonth} onFeatures={() => setActiveTab('features')}
            handleGlobalBranchChange={handleGlobalBranchChange} />}

          {activeTab === 'shifts' && (
            <div>
              <div className="flex items-center justify-between mb-6 border-b pb-4">
                <div className="flex items-center gap-3">
                  <CalendarClock className="text-indigo-600" size={28} />
                  <h2 className="text-2xl font-bold text-gray-800">استعراض شفتات الفرع</h2>
                </div>
                <div className="flex items-center gap-3">
                  {globalBranch === 'all' ? (
                    <select value={selectedTimelineBranch} onChange={e => setSelectedTimelineBranch(e.target.value)} className="p-2 border border-indigo-200 rounded-lg bg-indigo-50 font-bold text-indigo-800">
                      {branches.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  ) : (
                    <span className="bg-indigo-100 text-indigo-800 px-3 py-1.5 rounded-lg text-sm font-bold">
                      فرع {globalBranch}
                    </span>
                  )}
                </div>
              </div>
              <AdminShiftCalendar key={effectiveTimelineBranch} branch={effectiveTimelineBranch} />
            </div>
          )}


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
              onClick={() => setActiveTab(item.id as any)}
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
