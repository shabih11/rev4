import { BranchEmployees } from '../components/BranchEmployees';
import { ShiftCalendar } from '../components/ShiftCalendar';
import { LeaderboardLink } from '../components/LeaderboardLink';
import React, { useState, useCallback, useMemo } from 'react';
import { CalendarClock, LogOut, Search, CheckCircle2, Calendar as CalendarIcon, User, Clock, Check, Lock, ChevronDown } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useRecordScope } from '../hooks/useRecordScope';
import { formatTime, timeMinutes } from '../lib/formatDate';
import { UserProfileTab } from '../components/UserProfileTab';
import employeeImg from '../assets/employee.png';

// Fixed branch opening hours per specifications
const BRANCH_HOURS: Record<string, { open: string; nextDay: string; label: string }> = {
  'جاليري': { open: '14:00', nextDay: '14:00', label: 'الرياض جاليري (٢ مساءً)' },
  'الرياض جاليري': { open: '14:00', nextDay: '14:00', label: 'الرياض جاليري (٢ مساءً)' },
  'القصر': { open: '14:00', nextDay: '14:00', label: 'القصر مول (٢ مساءً)' },
  'القصر مول': { open: '14:00', nextDay: '14:00', label: 'القصر مول (٢ مساءً)' },
  'المملكة': { open: '10:00', nextDay: '10:00', label: 'المملكة (١٠ صباحاً)' },
  'شرق': { open: '07:00', nextDay: '07:00', label: 'شرق بلازا (٧ صباحاً)' },
  'شرق بلازا': { open: '07:00', nextDay: '07:00', label: 'شرق بلازا (٧ صباحاً)' },
  'ذافيو': { open: '12:00', nextDay: '12:00', label: 'ذافيو (١٢ مساءً)' },
  'سلام': { open: '10:00', nextDay: '10:00', label: 'سلام (١٠ صباحاً)' },
};

function getBranchHours(branchName?: string) {
  if (!branchName) return { open: '14:00', nextDay: '14:00', label: '٢ مساءً' };
  for (const [key, val] of Object.entries(BRANCH_HOURS)) {
    if (branchName.includes(key) || key.includes(branchName)) return val;
  }
  return { open: '14:00', nextDay: '14:00', label: '٢ مساءً' };
}

// Rules for editable months: current month anytime; previous month only within 2 days from the end of that month
function checkMonthEditable(year: number, month: number, refDate: Date = new Date()): { editable: boolean; reason?: string; type: 'current' | 'previous_grace' | 'locked' } {
  const currentYear = refDate.getFullYear();
  const currentMonth = refDate.getMonth(); // 0-indexed
  const currentDay = refDate.getDate(); // 1-indexed

  // 1. Current month: always editable
  if (year === currentYear && month === currentMonth) {
    return { editable: true, type: 'current' };
  }

  // 2. Previous month: editable only within 2 days from end of previous month
  const isPreviousMonth = (currentMonth === 0)
    ? (year === currentYear - 1 && month === 11)
    : (year === currentYear && month === currentMonth - 1);

  if (isPreviousMonth) {
    if (currentDay <= 2) {
      return { editable: true, type: 'previous_grace' };
    }
    return {
      editable: false,
      reason: 'انتهت مهلة تعديل شفتات الشهر السابق (التعديل متاح خلال يومين فقط من نهاية الشهر).',
      type: 'locked'
    };
  }

  // 3. Other past or future months
  if (year < currentYear || (year === currentYear && month < currentMonth)) {
    return {
      editable: false,
      reason: 'شفتات هذا الشهر مغلقة للتعديل (التعديل متاح للشهر الحالي فقط، وللشهر السابق خلال يومين فقط من نهاية الشهر).',
      type: 'locked'
    };
  }

  return {
    editable: false,
    reason: 'لا يمكن تعديل شفتات شهر قادم قبل بدئه.',
    type: 'locked'
  };
}

const MONTH_NAMES_AR = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
];



export const AdminDashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const { recordsReady, users, timeline, addTimelineEvent, updateTimelineEvent, deleteTimelineEvent, acceptShiftRequest } = useData();

  const [activeTab, setActiveTab] = useState<'shifts' | 'employees' | 'profile'>('shifts');
  useRecordScope(activeTab !== 'profile' ? { users: true, reviews: { branches: [user?.branch || ''] }, timeline: { branches: [user?.branch || ''] } } : {});

  // Month state for heatmap
  const today = useMemo(() => new Date(), []);
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth()); // 0-indexed

  // Day shift edit modal state
  const [selectedDayDate, setSelectedDayDate] = useState<Date | null>(null);
  const [shift1Emps, setShift1Emps] = useState<{ id: string; name: string }[]>([]);
  const [shift2Emps, setShift2Emps] = useState<{ id: string; name: string }[]>([]);
  const [searchQuery1, setSearchQuery1] = useState('');
  const [searchQuery2, setSearchQuery2] = useState('');
  const [showCoverageDropdown1, setShowCoverageDropdown1] = useState(false);
  const [showCoverageDropdown2, setShowCoverageDropdown2] = useState(false);

  const monthEditStatus = useMemo(() => {
    return checkMonthEditable(currentYear, currentMonth, today);
  }, [currentYear, currentMonth, today]);

  const [toast, setToast] = useState<string | null>(null);
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }, []);

  const branchEmployees = useMemo(() => {
    return users.filter(u => u.branch === user?.branch && u.role === 'employee');
  }, [users, user?.branch]);

  const outsourcedEmployees = useMemo(() => {
    return users.filter(u => u.branch !== user?.branch && u.role === 'employee');
  }, [users, user?.branch]);

  const coverageList1 = useMemo(() => {
    const map = new Map<string, { id: string; name: string; imageUrl?: string }>();
    outsourcedEmployees.forEach(e => map.set(e.id, { id: e.id, name: e.name, imageUrl: e.imageUrl }));
    shift1Emps.forEach(se => {
      if (!branchEmployees.some(be => be.id === se.id) && !map.has(se.id)) {
        const u = users.find(user => user.id === se.id);
        map.set(se.id, { id: se.id, name: se.name, imageUrl: u?.imageUrl });
      }
    });
    const list = Array.from(map.values());
    if (!searchQuery1.trim()) return list;
    return list.filter(e => e.name.includes(searchQuery1.trim()));
  }, [outsourcedEmployees, shift1Emps, branchEmployees, users, searchQuery1]);

  const coverageList2 = useMemo(() => {
    const map = new Map<string, { id: string; name: string; imageUrl?: string }>();
    outsourcedEmployees.forEach(e => map.set(e.id, { id: e.id, name: e.name, imageUrl: e.imageUrl }));
    shift2Emps.forEach(se => {
      if (!branchEmployees.some(be => be.id === se.id) && !map.has(se.id)) {
        const u = users.find(user => user.id === se.id);
        map.set(se.id, { id: se.id, name: se.name, imageUrl: u?.imageUrl });
      }
    });
    const list = Array.from(map.values());
    if (!searchQuery2.trim()) return list;
    return list.filter(e => e.name.includes(searchQuery2.trim()));
  }, [outsourcedEmployees, shift2Emps, branchEmployees, users, searchQuery2]);

  const selectedCoverage1Count = useMemo(() => {
    return shift1Emps.filter(e => !branchEmployees.some(be => be.id === e.id)).length;
  }, [shift1Emps, branchEmployees]);

  const selectedCoverage2Count = useMemo(() => {
    return shift2Emps.filter(e => !branchEmployees.some(be => be.id === e.id)).length;
  }, [shift2Emps, branchEmployees]);

  const branchHours = useMemo(() => {
    return getBranchHours(user?.branch);
  }, [user?.branch]);

  // Format date helper: DD-MM-YYYY
  const formatDayKey = useCallback((date: Date) => {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
  }, []);

  // Find shifts for a given date key in this branch
  const getShiftsForDate = useCallback((dateKey: string) => {
    if (!user?.branch || !dateKey) return { shift1: null, shift2: null };

    const dayShifts = timeline.filter(t => t.branch === user.branch && t.type === 'shift' && t.date === dateKey);

    const shift1 = dayShifts.find(t => {
      const mins = timeMinutes(t.time);
      return mins !== null && mins < 16 * 60;
    }) || null;

    const shift2 = dayShifts.find(t => {
      const mins = timeMinutes(t.time);
      return mins !== null && mins >= 16 * 60;
    }) || null;

    return { shift1, shift2 };
  }, [timeline, user?.branch]);

  // Open edit modal for a day
  const handleDayClick = (date: Date) => {
    const dateKey = formatDayKey(date);
    const { shift1, shift2 } = getShiftsForDate(dateKey);

    setSelectedDayDate(date);
    setShift1Emps(shift1?.employees || []);
    setShift2Emps(shift2?.employees || []);
    setSearchQuery1('');
    setSearchQuery2('');
  };

  // Save shifts for the selected day
  const handleSaveDayShifts = () => {
    if (!recordsReady) {
      showToast('انتظري اكتمال تحميل السجلات قبل الحفظ');
      return;
    }
    if (!monthEditStatus.editable) {
      showToast(monthEditStatus.reason || 'عفواً، لا يمكن تعديل شفتات هذا الشهر');
      return;
    }
    if (!selectedDayDate || !user?.branch) return;
    const dateKey = formatDayKey(selectedDayDate);
    const { shift1, shift2 } = getShiftsForDate(dateKey);

    // Save or delete Shift 1
    if (shift1Emps.length > 0) {
      if (shift1) {
        updateTimelineEvent(shift1.id, {
          employees: shift1Emps,
          time: branchHours.open,
          endTime: '16:00',
        });
      } else {
        addTimelineEvent({
          branch: user.branch,
          type: 'shift',
          title: 'الشفت الأول',
          date: dateKey,
          time: branchHours.open,
          endTime: '16:00',
          employees: shift1Emps,
        });
      }
    } else if (shift1) {
      deleteTimelineEvent(shift1.id);
    }

    // Save or delete Shift 2
    if (shift2Emps.length > 0) {
      if (shift2) {
        updateTimelineEvent(shift2.id, {
          employees: shift2Emps,
          time: '16:00',
          endTime: branchHours.nextDay,
        });
      } else {
        addTimelineEvent({
          branch: user.branch,
          type: 'shift',
          title: 'الشفت الثاني',
          date: dateKey,
          time: '16:00',
          endTime: branchHours.nextDay,
          employees: shift2Emps,
        });
      }
    } else if (shift2) {
      deleteTimelineEvent(shift2.id);
    }

    setSelectedDayDate(null);
    showToast(`تم حفظ شفتات يوم ${selectedDayDate.getDate()} ${MONTH_NAMES_AR[selectedDayDate.getMonth()]} بنجاح`);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans pb-24" dir="rtl">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[200] bg-emerald-600 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-2 animate-fade-in font-bold text-sm">
          <CheckCircle2 size={18} />
          {toast}
        </div>
      )}

      {/* Header */}
      <header className="bg-gradient-to-r from-blue-700 via-indigo-700 to-purple-800 text-white px-4 md:px-8 py-4 shadow-md sticky top-0 z-30 flex justify-between items-center backdrop-blur-md">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg md:text-xl font-black">لوحة إدارة فرع {user?.branch}</h1>
          </div>
          <p className="text-xs text-blue-100 font-medium mt-0.5">
            بدء العمل في الفرع : {formatTime(branchHours.open)}
          </p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <LeaderboardLink className="text-blue-100 hover:bg-white/10" />
        <button
          onClick={logout}
          className="p-2 hover:bg-white/10 rounded-xl flex items-center gap-1.5 text-xs font-bold text-blue-100 transition cursor-pointer"
          title="تسجيل الخروج"
        >
          <span>خروج</span>
          <LogOut size={16} />
        </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 p-4 md:p-8 max-w-5xl mx-auto w-full">
        <div className="p-3 text-center">
        </div>
        {activeTab === 'shifts' && (
          <div className="space-y-6">
            <ShiftCalendar shifts={timeline.filter(t => t.type === 'shift' && t.branch === user?.branch)} onSelect={key => {
              const [day, month, year] = key.split('-').map(Number);
              setCurrentYear(year); setCurrentMonth(month - 1);
              handleDayClick(new Date(year, month - 1, day));
            }} />
          </div>
        )}

        {activeTab === 'employees' && <div className="space-y-6"><BranchEmployees branch={user?.branch} />
            <section className="bg-white p-5 rounded-3xl border space-y-3">
              <h2 className="font-bold text-xl">طلبات تسجيل شفت مفقود</h2>
              {timeline.filter(r => r.branch === user?.branch && r.requestStatus).map(r => <div key={r.id} className="border rounded-xl p-4">
                <strong>{r.employees?.filter(e => users.some(user => user.id === e.id)).map(e => e.name).join('، ')} — {r.date} — الشفت {r.requestedShift === 'first' ? 'الأول' : 'الثاني'}</strong>
                {r.requestStatus === 'pending' ? <div className="flex gap-3 mt-3">
                  <button disabled={!recordsReady} className="bg-emerald-600 text-white rounded-xl p-2" onClick={() => {
                    acceptShiftRequest(r.id, r.requestedShift === 'first' ? branchHours.open : '16:00', r.requestedShift === 'first' ? '16:00' : branchHours.nextDay);
                  }}>شفت مفقود — قبول وإضافة</button>
                  <button disabled={!recordsReady} className="bg-red-50 text-red-700 rounded-xl p-2" onClick={() => updateTimelineEvent(r.id, { requestStatus: 'rejected', rejectedAt: Date.now() })}>الطلب غير صحيح — رفض</button>
                </div> : <p>{r.requestStatus === 'accepted' ? 'تم قبول الطلب' : 'تم رفض الطلب'}</p>}
              </div>)}
            </section>
        </div>}

        {/* Profile Tab */}
        {activeTab === 'profile' && <UserProfileTab />}
      </main>

      {/* Edit Shifts Modal for Selected Day */}
      {selectedDayDate && (
        <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-fade-in font-sans" dir="rtl">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-5 sm:p-8 shadow-2xl border border-slate-200 max-h-[92vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b pb-4 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center">
                  <CalendarIcon size={24} />
                </div>
                <div>
                  <h3 className="text-lg sm:text-xl font-black text-slate-900">
                    شفتات {selectedDayDate.getDate()} {MONTH_NAMES_AR[selectedDayDate.getMonth()]} {selectedDayDate.getFullYear()}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">فرع {user?.branch}</p>
                </div>
              </div>

              <button
                onClick={() => setSelectedDayDate(null)}
                className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center font-bold text-lg transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Body: Scrollable */}
            <div className="flex-1 overflow-y-auto py-5 space-y-6 pr-1 custom-scrollbar">
              {!monthEditStatus.editable && (
                <div className="bg-amber-50 border border-amber-200 p-3.5 rounded-2xl flex items-center gap-2.5 text-xs text-amber-900 font-bold shadow-sm">
                  <Lock size={18} className="shrink-0 text-amber-700" />
                  <span>{monthEditStatus.reason || 'هذا الشهر مغلق للتعديل. التعديل متاح للشهر الحالي فقط، وللشهر السابق خلال يومين فقط من نهاية الشهر.'}</span>
                </div>
              )}

              {/* SHIFT 1 CARD */}
              <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-indigo-600"></span>
                    <h4 className="font-black text-base text-slate-800">الشفت الأول</h4>
                  </div>
                  <span className="text-xs bg-indigo-100 text-indigo-800 font-bold px-3 py-1 rounded-full flex items-center gap-1 w-fit">
                    <Clock size={12} />
                    {formatTime(branchHours.open)} إلى ٠٤:٠٠ م (ثابت)
                  </span>
                </div>

                {monthEditStatus.editable ? (
                  <>
                    {/* Shift 1 Branch Employees Selection - Grid Tiles */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-2.5">
                        موظفات الفرع المتواجدات بالشفت الأول:
                      </label>
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 sm:gap-2.5">
                        {branchEmployees.map(emp => {
                          const isSelected = shift1Emps.some(e => e.id === emp.id);
                          return (
                            <button
                              key={emp.id}
                              type="button"
                              onClick={() => {
                                if (isSelected) {
                                  setShift1Emps(prev => prev.filter(e => e.id !== emp.id));
                                } else {
                                  setShift1Emps(prev => [...prev, { id: emp.id, name: emp.name }]);
                                }
                              }}
                              className={`p-2 sm:p-2.5 rounded-2xl flex flex-col items-center justify-between text-center relative border transition-all cursor-pointer select-none group aspect-square ${
                                isSelected
                                  ? 'bg-indigo-50/95 border-2 border-indigo-600 text-indigo-950 font-black shadow-md ring-2 ring-indigo-500/20 scale-[1.02]'
                                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                              }`}
                            >
                              <div className={`absolute top-1.5 left-1.5 sm:top-2 sm:left-2 w-4 h-4 sm:w-5 sm:h-5 rounded-md flex items-center justify-center shrink-0 transition-colors ${
                                isSelected ? 'bg-indigo-600 text-white shadow-sm' : 'border border-slate-300 bg-white/80'
                              }`}>
                                {isSelected && <Check size={12} strokeWidth={3} />}
                              </div>
                              <img
                                src={emp.imageUrl || employeeImg}
                                alt={emp.name}
                                className={`w-11 h-11 sm:w-14 sm:h-14 rounded-full object-cover object-top border-2 shadow-sm shrink-0 transition-transform group-hover:scale-105 ${
                                  isSelected ? 'border-indigo-600 ring-2 ring-indigo-200' : 'border-slate-100'
                                }`}
                              />
                              <span className="text-[11px] sm:text-xs font-bold truncate w-full text-center mt-1">
                                {emp.name}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Shift 1 Coverage Employees Selection - Collapsible Dropdown */}
                    <div className="pt-2 border-t border-slate-200/70 space-y-2">
                      <button
                        type="button"
                        onClick={() => setShowCoverageDropdown1(prev => !prev)}
                        className="w-full p-3 rounded-2xl border border-indigo-200/90 bg-white hover:bg-indigo-50/40 transition-all flex items-center justify-between shadow-sm cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs shrink-0">
                            💼
                          </div>
                          <div className="text-right">
                            <span className="block text-xs font-black text-slate-800">
                              موظفات التغطية (المصدر الخارجي)
                            </span>
                            <span className="block text-[10px] text-slate-400">
                              {selectedCoverage1Count > 0
                                ? `${selectedCoverage1Count} موظفة تغطية مختارة للشفت الأول`
                                : 'انقري لعرض واختيار موظفات التغطية'}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {selectedCoverage1Count > 0 && (
                            <span className="bg-indigo-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-sm">
                              {selectedCoverage1Count} مختارة
                            </span>
                          )}
                          <div className="p-1 rounded-lg bg-slate-100 text-slate-500">
                            <ChevronDown
                              size={16}
                              className={`transition-transform duration-200 ${
                                showCoverageDropdown1 ? 'rotate-180 text-indigo-600' : ''
                              }`}
                            />
                          </div>
                        </div>
                      </button>

                      {showCoverageDropdown1 && (
                        <div className="p-3 bg-white border border-indigo-100 rounded-2xl shadow-sm space-y-2.5 animate-fade-in">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-bold text-indigo-950">
                              موظفات التغطية بالشفت الأول:
                            </span>
                            {outsourcedEmployees.length > 5 && (
                              <div className="relative w-36 sm:w-44">
                                <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
                                <input
                                  type="text"
                                  placeholder="بحث بالاسم..."
                                  value={searchQuery1}
                                  onChange={e => setSearchQuery1(e.target.value)}
                                  className="w-full pr-7 pl-2 py-1 border border-slate-200 rounded-lg text-[11px] bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                />
                              </div>
                            )}
                          </div>

                          {coverageList1.length > 0 ? (
                            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 sm:gap-2.5 max-h-64 overflow-y-auto p-1">
                              {coverageList1.map(emp => {
                                const isSelected = shift1Emps.some(e => e.id === emp.id);
                                return (
                                  <button
                                    key={emp.id}
                                    type="button"
                                    onClick={() => {
                                      if (isSelected) {
                                        setShift1Emps(prev => prev.filter(e => e.id !== emp.id));
                                      } else {
                                        setShift1Emps(prev => [...prev, { id: emp.id, name: emp.name }]);
                                      }
                                    }}
                                    className={`p-2 sm:p-2.5 rounded-2xl flex flex-col items-center justify-between text-center relative border transition-all cursor-pointer select-none group aspect-square ${
                                      isSelected
                                        ? 'bg-indigo-50/95 border-2 border-indigo-600 text-indigo-950 font-black shadow-md ring-2 ring-indigo-500/20 scale-[1.02]'
                                        : 'bg-white border-dashed border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-slate-400'
                                    }`}
                                  >
                                    <div className={`absolute top-1.5 left-1.5 sm:top-2 sm:left-2 w-4 h-4 sm:w-5 sm:h-5 rounded-md flex items-center justify-center shrink-0 transition-colors ${
                                      isSelected ? 'bg-indigo-600 text-white shadow-sm' : 'border border-slate-300 bg-white/80'
                                    }`}>
                                      {isSelected && <Check size={12} strokeWidth={3} />}
                                    </div>
                                    <img
                                      src={emp.imageUrl || employeeImg}
                                      alt={emp.name}
                                      className={`w-11 h-11 sm:w-14 sm:h-14 rounded-full object-cover object-top border-2 shadow-sm shrink-0 transition-transform group-hover:scale-105 ${
                                        isSelected ? 'border-indigo-600 ring-2 ring-indigo-200' : 'border-slate-100'
                                      }`}
                                    />
                                    <div className="w-full text-center mt-1">
                                      <span className="text-[11px] sm:text-xs font-bold truncate block w-full">
                                        {emp.name}
                                      </span>
                                      <span className="text-[9px] text-indigo-600 font-semibold block leading-tight">
                                        تغطية
                                      </span>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          ) : (
                            <p className="text-xs text-slate-400 italic py-2 text-center">لا توجد نتائج مطابقة لموظفات التغطية.</p>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-2.5">
                      موظفات الشفت الأول المسجلات:
                    </label>
                    {shift1Emps.length > 0 ? (
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 sm:gap-2.5">
                        {shift1Emps.filter(emp => users.some(user => user.id === emp.id)).map(emp => {
                          const u = users.find(user => user.id === emp.id);
                          return (
                            <div
                              key={emp.id}
                              className="p-2 sm:p-2.5 rounded-2xl flex flex-col items-center justify-between text-center bg-indigo-50 border border-indigo-200 text-indigo-900 aspect-square shadow-sm"
                            >
                              <img
                                src={u?.imageUrl || employeeImg}
                                alt={emp.name}
                                className="w-11 h-11 sm:w-14 sm:h-14 rounded-full object-cover object-top border-2 border-indigo-300 shadow-sm shrink-0"
                              />
                              <span className="text-[11px] sm:text-xs font-bold truncate w-full text-center mt-1">
                                {emp.name}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 italic">لا توجد موظفات مسجلات في هذا الشفت.</p>
                    )}
                  </div>
                )}
              </div>

              {/* SHIFT 2 CARD */}
              <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-purple-600"></span>
                    <h4 className="font-black text-base text-slate-800">الشفت الثاني</h4>
                  </div>
                  <span className="text-xs bg-purple-100 text-purple-800 font-bold px-3 py-1 rounded-full flex items-center gap-1 w-fit">
                    <Clock size={12} />
                    ٠٤:٠٠ م إلى {formatTime(branchHours.nextDay)} اليوم التالي (ثابت)
                  </span>
                </div>

                {monthEditStatus.editable ? (
                  <>
                    {/* Shift 2 Branch Employees Selection - Grid Tiles */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-2.5">
                        موظفات الفرع المتواجدات بالشفت الثاني:
                      </label>
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 sm:gap-2.5">
                        {branchEmployees.map(emp => {
                          const isSelected = shift2Emps.some(e => e.id === emp.id);
                          return (
                            <button
                              key={emp.id}
                              type="button"
                              onClick={() => {
                                if (isSelected) {
                                  setShift2Emps(prev => prev.filter(e => e.id !== emp.id));
                                } else {
                                  setShift2Emps(prev => [...prev, { id: emp.id, name: emp.name }]);
                                }
                              }}
                              className={`p-2 sm:p-2.5 rounded-2xl flex flex-col items-center justify-between text-center relative border transition-all cursor-pointer select-none group aspect-square ${
                                isSelected
                                  ? 'bg-purple-50/95 border-2 border-purple-600 text-purple-950 font-black shadow-md ring-2 ring-purple-500/20 scale-[1.02]'
                                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                              }`}
                            >
                              <div className={`absolute top-1.5 left-1.5 sm:top-2 sm:left-2 w-4 h-4 sm:w-5 sm:h-5 rounded-md flex items-center justify-center shrink-0 transition-colors ${
                                isSelected ? 'bg-purple-600 text-white shadow-sm' : 'border border-slate-300 bg-white/80'
                              }`}>
                                {isSelected && <Check size={12} strokeWidth={3} />}
                              </div>
                              <img
                                src={emp.imageUrl || employeeImg}
                                alt={emp.name}
                                className={`w-11 h-11 sm:w-14 sm:h-14 rounded-full object-cover object-top border-2 shadow-sm shrink-0 transition-transform group-hover:scale-105 ${
                                  isSelected ? 'border-purple-600 ring-2 ring-purple-200' : 'border-slate-100'
                                }`}
                              />
                              <span className="text-[11px] sm:text-xs font-bold truncate w-full text-center mt-1">
                                {emp.name}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Shift 2 Coverage Employees Selection - Collapsible Dropdown */}
                    <div className="pt-2 border-t border-slate-200/70 space-y-2">
                      <button
                        type="button"
                        onClick={() => setShowCoverageDropdown2(prev => !prev)}
                        className="w-full p-3 rounded-2xl border border-purple-200/90 bg-white hover:bg-purple-50/40 transition-all flex items-center justify-between shadow-sm cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-xs shrink-0">
                            💼
                          </div>
                          <div className="text-right">
                            <span className="block text-xs font-black text-slate-800">
                              موظفات التغطية (المصدر الخارجي)
                            </span>
                            <span className="block text-[10px] text-slate-400">
                              {selectedCoverage2Count > 0
                                ? `${selectedCoverage2Count} موظفة تغطية مختارة للشفت الثاني`
                                : 'انقري لعرض واختيار موظفات التغطية'}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {selectedCoverage2Count > 0 && (
                            <span className="bg-purple-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-sm">
                              {selectedCoverage2Count} مختارة
                            </span>
                          )}
                          <div className="p-1 rounded-lg bg-slate-100 text-slate-500">
                            <ChevronDown
                              size={16}
                              className={`transition-transform duration-200 ${
                                showCoverageDropdown2 ? 'rotate-180 text-purple-600' : ''
                              }`}
                            />
                          </div>
                        </div>
                      </button>

                      {showCoverageDropdown2 && (
                        <div className="p-3 bg-white border border-purple-100 rounded-2xl shadow-sm space-y-2.5 animate-fade-in">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-bold text-purple-950">
                              موظفات التغطية بالشفت الثاني:
                            </span>
                            {outsourcedEmployees.length > 5 && (
                              <div className="relative w-36 sm:w-44">
                                <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
                                <input
                                  type="text"
                                  placeholder="بحث بالاسم..."
                                  value={searchQuery2}
                                  onChange={e => setSearchQuery2(e.target.value)}
                                  className="w-full pr-7 pl-2 py-1 border border-slate-200 rounded-lg text-[11px] bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                                />
                              </div>
                            )}
                          </div>

                          {coverageList2.length > 0 ? (
                            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 sm:gap-2.5 max-h-64 overflow-y-auto p-1">
                              {coverageList2.map(emp => {
                                const isSelected = shift2Emps.some(e => e.id === emp.id);
                                return (
                                  <button
                                    key={emp.id}
                                    type="button"
                                    onClick={() => {
                                      if (isSelected) {
                                        setShift2Emps(prev => prev.filter(e => e.id !== emp.id));
                                      } else {
                                        setShift2Emps(prev => [...prev, { id: emp.id, name: emp.name }]);
                                      }
                                    }}
                                    className={`p-2 sm:p-2.5 rounded-2xl flex flex-col items-center justify-between text-center relative border transition-all cursor-pointer select-none group aspect-square ${
                                      isSelected
                                        ? 'bg-purple-50/95 border-2 border-purple-600 text-purple-950 font-black shadow-md ring-2 ring-purple-500/20 scale-[1.02]'
                                        : 'bg-white border-dashed border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-slate-400'
                                    }`}
                                  >
                                    <div className={`absolute top-1.5 left-1.5 sm:top-2 sm:left-2 w-4 h-4 sm:w-5 sm:h-5 rounded-md flex items-center justify-center shrink-0 transition-colors ${
                                      isSelected ? 'bg-purple-600 text-white shadow-sm' : 'border border-slate-300 bg-white/80'
                                    }`}>
                                      {isSelected && <Check size={12} strokeWidth={3} />}
                                    </div>
                                    <img
                                      src={emp.imageUrl || employeeImg}
                                      alt={emp.name}
                                      className={`w-11 h-11 sm:w-14 sm:h-14 rounded-full object-cover object-top border-2 shadow-sm shrink-0 transition-transform group-hover:scale-105 ${
                                        isSelected ? 'border-purple-600 ring-2 ring-purple-200' : 'border-slate-100'
                                      }`}
                                    />
                                    <div className="w-full text-center mt-1">
                                      <span className="text-[11px] sm:text-xs font-bold truncate block w-full">
                                        {emp.name}
                                      </span>
                                      <span className="text-[9px] text-purple-600 font-semibold block leading-tight">
                                        تغطية
                                      </span>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          ) : (
                            <p className="text-xs text-slate-400 italic py-2 text-center">لا توجد نتائج مطابقة لموظفات التغطية.</p>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-2.5">
                      موظفات الشفت الثاني المسجلات:
                    </label>
                    {shift2Emps.length > 0 ? (
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 sm:gap-2.5">
                        {shift2Emps.filter(emp => users.some(user => user.id === emp.id)).map(emp => {
                          const u = users.find(user => user.id === emp.id);
                          return (
                            <div
                              key={emp.id}
                              className="p-2 sm:p-2.5 rounded-2xl flex flex-col items-center justify-between text-center bg-purple-50 border border-purple-200 text-purple-900 aspect-square shadow-sm"
                            >
                              <img
                                src={u?.imageUrl || employeeImg}
                                alt={emp.name}
                                className="w-11 h-11 sm:w-14 sm:h-14 rounded-full object-cover object-top border-2 border-purple-300 shadow-sm shrink-0"
                              />
                              <span className="text-[11px] sm:text-xs font-bold truncate w-full text-center mt-1">
                                {emp.name}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 italic">لا توجد موظفات مسجلات في هذا الشفت.</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex gap-2.5 pt-4 border-t shrink-0">
              {monthEditStatus.editable ? (
                <>
                  <button
                    type="button"
                    onClick={handleSaveDayShifts}
                    disabled={!recordsReady}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-3 px-6 rounded-2xl shadow-md transition text-sm flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Check size={18} />
                    حفظ شفتات اليوم
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedDayDate(null)}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 px-6 rounded-2xl transition text-sm cursor-pointer"
                  >
                    إلغاء
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setSelectedDayDate(null)}
                  className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 px-6 rounded-2xl transition text-sm cursor-pointer"
                >
                  إغلاق
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bottom Navigation: 2 tabs (Shifts Calendar & Profile) */}
      <nav aria-label="التبويبات" className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur-lg px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-lg gap-2">
          {([{ id: 'employees', label: 'الموظفات', Icon: User }, { id: 'shifts', label: 'الشفتات', Icon: CalendarClock }, { id: 'profile', label: 'شخصي', Icon: User }] as const).map(({ id, label, Icon }) => <button key={id} aria-current={activeTab === id ? 'page' : undefined} onClick={() => setActiveTab(id)} className={`tab-button ${activeTab === id ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-50'}`}><Icon size={22} /><span>{label}</span></button>)}
        </div>
      </nav>
    </div>
  );
};
