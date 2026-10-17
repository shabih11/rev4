import React, { useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { AlertOctagon, Users, LogOut, Building2, Activity, CalendarClock, MessageSquareWarning, Upload, ShieldAlert, PlusCircle, CheckCircle2, BarChart3, Trash2, Edit, Undo2, History, Zap, Copy, Check, RefreshCw, Globe, Link } from 'lucide-react';
import { WINDSOR_API_EXAMPLE, WINDSOR_REVIEW_FIELDS } from '../lib/windsorIntegration';
import { matchEmployee } from '../lib/mockData';
import employeeImg from '../assets/employee.png';
import { formatDateTime, toEnglishNumerals, formatDate, formatTime, formatTimestamp, shiftName } from '../lib/formatDate';

export const SystemAdminDashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const verifiedImportReport: { received: number; added: number; alreadyPresent: number; archived: number; linked: number; unlinked: number; dateFrom: string; dateTo: string; branches: Record<string, { total: number; linked: number; unlinked: number }> } | null = (() => {
    try { return JSON.parse(localStorage.getItem('app_verified_windsor_import_report') || 'null'); } catch { return null; }
  })();
  const { users, updateUser, addUser, removeUser, branchSettings, updateBranchSettings, timeline, addTimelineEvent, updateTimelineEvent, deleteTimelineEvent, reviews, parseReviewsText, commitReviews, commitShifts, updateReview, deleteReview, undoBatch, clearData, windsorBranchMapping, setWindsorBranchMapping, windsorApiUrl, setWindsorApiUrl, windsorApiUrl2, setWindsorApiUrl2, windsorAutoSync, setWindsorAutoSync, fetchAndProcessWindsorReviews } = useData();
  const [activeTab, setActiveTab] = useState<'timeline' | 'branches' | 'employees' | 'notes' | 'stats' | 'history' | 'shifts' | 'windsor' | 'danger'>('timeline');
  
  const [mappingText, setMappingText] = useState(JSON.stringify(windsorBranchMapping, null, 2));
  const [tempWindsorUrl, setTempWindsorUrl] = useState(windsorApiUrl);
  const [tempWindsorUrl2, setTempWindsorUrl2] = useState(windsorApiUrl2);
  const [isFetchingWindsor, setIsFetchingWindsor] = useState(false);
  const [windsorStatusMsg, setWindsorStatusMsg] = useState<{ text: string, type: 'success' | 'error' | 'info' } | null>(null);
  const [copiedSchema, setCopiedSchema] = useState(false);

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

  const branchEmployees = users.filter(u => (effectiveBranch === 'موظفة خارجية' ? u.branch === 'موظفة خارجية' : u.branch === effectiveBranch) && u.role === 'employee');
  const filteredTimeline = timeline.filter(t => t.branch === effectiveTimelineBranch);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingEmpId, setUploadingEmpId] = useState<string | null>(null);

  const [reviewsText, setReviewsText] = useState('');
  const [shiftsText, setShiftsText] = useState('');
  const [pendingReviews, setPendingReviews] = useState<{ reviews: any[], timelineEvents: any[] } | null>(null);
  const [pendingShifts, setPendingShifts] = useState<any[]>([]);
  const [unmatchedShiftNames, setUnmatchedShiftNames] = useState<string[]>([]);
  const [shiftMappings, setShiftMappings] = useState<Record<string, string>>({});
  
  const [viewingReviewsMonth, setViewingReviewsMonth] = useState('');
  const [linkingReviewId, setLinkingReviewId] = useState<string | null>(null);
  const [linkingSelection, setLinkingSelection] = useState<string[]>([]);
  const [editingTimeId, setEditingTimeId] = useState<string | null>(null);
  const [editingTimeValue, setEditingTimeValue] = useState<string>('');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteTitle, setEditingNoteTitle] = useState('');
  const [editingNoteComment, setEditingNoteComment] = useState('');
  const allAvailableEmployees = users.filter(u => (u.branch === effectiveTimelineBranch || u.branch === 'موظفة خارجية') && u.role === 'employee');

  const navItems = [
    { id: 'timeline', label: 'الخط الزمني', icon: Activity, color: 'text-blue-600', activeBg: 'bg-blue-50 text-blue-700 border-r-4 border-blue-600' },
    { id: 'shifts', label: 'الشفتات', icon: CalendarClock, color: 'text-indigo-600', activeBg: 'bg-indigo-50 text-indigo-700 border-r-4 border-indigo-600' },
    { id: 'branches', label: 'الفروع', icon: Building2, color: 'text-blue-600', activeBg: 'bg-blue-50 text-blue-700 border-r-4 border-blue-600' },
    { id: 'employees', label: 'الموظفات', icon: Users, color: 'text-emerald-600', activeBg: 'bg-emerald-50 text-emerald-700 border-r-4 border-emerald-600' },
    { id: 'notes', label: 'الملاحظات', icon: MessageSquareWarning, color: 'text-amber-600', activeBg: 'bg-amber-50 text-amber-700 border-r-4 border-amber-600' },
    { id: 'stats', label: 'التقييمات', icon: BarChart3, color: 'text-blue-600', activeBg: 'bg-blue-50 text-blue-700 border-r-4 border-blue-600' },
    { id: 'history', label: 'السجل', icon: History, color: 'text-slate-600', activeBg: 'bg-slate-100 text-slate-800 border-r-4 border-slate-600' },
    { id: 'windsor', label: 'Windsor.ai', icon: Zap, color: 'text-purple-600', activeBg: 'bg-purple-50 text-purple-700 border-r-4 border-purple-600' },
    { id: 'danger', label: 'منطقة الخطر', icon: ShieldAlert, color: 'text-red-600', activeBg: 'bg-red-50 text-red-700 border-r-4 border-red-600' },
  ] as const;

  const injectionBatches = React.useMemo(() => {
    const batches = new Map<string, { id: string, time: number, type: 'review' | 'shift', count: number, branch: string }>();
    
    reviews.forEach(r => {
      if (r.batchId) {
        if (!batches.has(r.batchId)) {
          batches.set(r.batchId, { id: r.batchId, time: parseInt(r.batchId.split('_')[1]) || 0, type: 'review', count: 0, branch: r.branch });
        }
        batches.get(r.batchId)!.count++;
      }
    });

    timeline.forEach(t => {
      if (t.batchId && t.type === 'shift') {
        if (!batches.has(t.batchId)) {
          batches.set(t.batchId, { id: t.batchId, time: parseInt(t.batchId.split('_')[1]) || 0, type: 'shift', count: 0, branch: t.branch });
        }
        batches.get(t.batchId)!.count++;
      }
    });

    return Array.from(batches.values()).sort((a, b) => b.time - a.time);
  }, [reviews, timeline]);

  const handleUndoBatch = (batchId: string) => {
    if (confirm('هل أنت متأكد من التراجع عن عملية الحقن هذه؟ سيتم حذف جميع البيانات المرتبطة بها.')) {
      undoBatch(batchId);
      showToast('تم التراجع عن الحقن بنجاح');
    }
  };

  const handleInjectReviews = () => {
    if (!reviewsText.trim()) return;
    const batchId = `batch_${Date.now()}`;
    const parsed = parseReviewsText(selectedBranch, reviewsText, batchId);
    if (parsed.reviews.length > 0) {
      setPendingReviews(parsed);
      showToast('تم استخراج التقييمات بنجاح، يرجى مراجعتها وتأكيد الحقن');
    } else {
      showToast('لم يتم العثور على تقييمات بصيغة صحيحة');
    }
  };

  const handleConfirmReviews = () => {
    if (!pendingReviews) return;
    commitReviews(pendingReviews.reviews, pendingReviews.timelineEvents);
    setPendingReviews(null);
    setReviewsText('');
    showToast('تم اعتماد التقييمات بنجاح');
  };

  const handleRemovePendingReview = (id: string) => {
    if (!pendingReviews) return;
    const filteredR = pendingReviews.reviews.filter(r => r.id !== id);
    const filteredT = pendingReviews.timelineEvents.filter(t => t.id !== id);
    if (filteredR.length === 0) {
      setPendingReviews(null);
    } else {
      setPendingReviews({ reviews: filteredR, timelineEvents: filteredT });
    }
  };

  const handleParseShifts = () => {
    if (!shiftsText.trim()) return;
    const blocks = shiftsText.split(/\n\s*\n/);
    const parsed: any[] = [];
    const unmatched = new Set<string>();

    blocks.forEach(block => {
      const startMatch = block.match(/وقت البداية:[ \t]*([^\s]+)(?:[ \t]+([^\s]+))?/);
      const endMatch = block.match(/وقت النهاية:[ \t]*([^\s]+)(?:[ \t]+([^\s]+))?/);
      const dateMatch = block.match(/التاريخ:[ \t]*([^\s]+)/);
      const empMatch = block.match(/الموظفات:\s*(.+)/);
      
      if (startMatch && endMatch && empMatch) {
        const normalize = (s: string) => s.replace(/[٠-٩]/g, (d: any) => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)]);
        const startTime = normalize(startMatch[1].trim());
        let extractedDate = startMatch[2] ? startMatch[2].trim() : null;
        if (!extractedDate && dateMatch) {
          extractedDate = dateMatch[1].trim();
        }
        const startDate = extractedDate ? normalize(extractedDate).replace(/\//g, '-') : new Date().toLocaleDateString('en-GB').replace(/\//g, '-');
        const endTime = normalize(endMatch[1].trim());
        const endDate = endMatch[2] ? normalize(endMatch[2].trim()).replace(/\//g, '-') : startDate;
        
        const nameString = empMatch[1];
        const names = Array.from(nameString.matchAll(/\(([^)]+)\)/g)).map(m => m[1].trim());
        if (names.length === 0) {
          // Fallback if they don't use parentheses
          names.push(...nameString.split(/[\s,،]+/).filter(n => n.trim().length > 0));
        }
        
        const shiftEmployees: {id: string, name: string}[] = [];
        names.forEach(name => {
          const foundEmp = matchEmployee(users, selectedBranch, name);
          if (foundEmp) {
            shiftEmployees.push({ id: foundEmp.id, name: foundEmp.name });
          } else {
            shiftEmployees.push({ id: `unmatched_${name}`, name: name });
            unmatched.add(name);
          }
        });

        parsed.push({
          id: `shift_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          branch: selectedBranch,
          type: 'shift',
          title: `شفت محقون`,
          time: startTime,
          endTime: endTime,
          date: startDate,
          endDate: endDate,
          employees: shiftEmployees
        });
      }
    });

    setPendingShifts(parsed);
    setUnmatchedShiftNames(Array.from(unmatched));
    setShiftMappings({});
    
    if (parsed.length > 0) {
      if (unmatched.size > 0) {
        showToast('يوجد أسماء غير مرتبطة، يرجى ربطها أولاً');
      } else {
        showToast('تم استخراج الشفتات بنجاح، يرجى مراجعتها وتأكيد الحقن');
      }
    } else {
      showToast('لم يتم العثور على شفتات بصيغة صحيحة');
    }
  };

  const handleConfirmShifts = () => {
    let finalShifts = [...pendingShifts];
    
    for (const name of unmatchedShiftNames) {
       const mappedValue = shiftMappings[name];
       if (!mappedValue) {
          showToast(`يرجى ربط الموظفة: ${name}`);
          return;
       }
       
       let realId = mappedValue;
       if (mappedValue === 'new') {
          realId = `emp_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
          addUser({ 
            id: realId, 
            name: name, 
            branch: selectedBranch, 
            role: 'employee',
            email: `${realId}@iamspecial.sa`,
            imageUrl: '/rev4/avatars/avatar_1.png',
            stats: { positive: 0, negative: 0, complaints: 0, safety: 0 }
          });
       }
       
       finalShifts = finalShifts.map(s => ({
         ...s,
         employees: s.employees?.map((e: any) => e.id === `unmatched_${name}` ? { id: realId, name: mappedValue === 'new' ? name : users.find(u => u.id === realId)?.name || name } : e)
       }));
    }
    
    const batchId = `batch_${Date.now()}`;
    commitShifts(finalShifts, batchId);
    setPendingShifts([]);
    setUnmatchedShiftNames([]);
    setShiftMappings({});
    setShiftsText('');
    showToast('تم حقن الشفتات بنجاح');
  };

  const handleRemovePendingShift = (id: string) => {
    setPendingShifts(prev => prev.filter(s => s.id !== id));
  };
  
  const handleSaveLinking = (timelineId: string, reviewId: string | undefined) => {
    const selectedEmps = allAvailableEmployees.filter(u => linkingSelection.includes(u.id)).map(e => ({ id: e.id, name: e.name }));
    updateTimelineEvent(timelineId, { employees: selectedEmps });
    if (reviewId) {
      updateReview(reviewId, { linkedEmployeeIds: linkingSelection });
    }
    setLinkingReviewId(null);
    setLinkingSelection([]);
  };

  const handleDeleteTimelineEvent = (id: string, reviewId?: string) => {
    if (!confirm('هل أنت متأكد من الحذف؟')) return;
    if (reviewId) {
      deleteReview(reviewId);
    } else {
      deleteTimelineEvent(id);
    }
    showToast('تم الحذف بنجاح');
  };

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

  const handleTransfer = (id: string, newBranch: string) => {
    updateUser(id, { branch: newBranch });
    showToast('تم نقل الموظفة بنجاح');
  };

  // handleSaveTimes was moved inline into the branch list map

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && uploadingEmpId) {
      showToast('جاري معالجة الصورة...'); // Show immediate feedback
      
      // Use createObjectURL for instant, non-blocking image load
      const imageUrl = URL.createObjectURL(file);
      const img = new Image();
      
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        // Maintain high resolution but cap at 1200px to prevent freeze & localStorage quota issues
        const MAX_DIMENSION = 1200;
        if (width > height && width > MAX_DIMENSION) {
          height = Math.round((height * MAX_DIMENSION) / width);
          width = MAX_DIMENSION;
        } else if (height > MAX_DIMENSION) {
          width = Math.round((width * MAX_DIMENSION) / height);
          height = MAX_DIMENSION;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);

        // Convert to WebP format with high quality (0.95) to preserve visual quality
        // but significantly reduce base64 size so it doesn't freeze the app
        try {
          const webpDataUrl = canvas.toDataURL('image/webp', 0.95);
          updateUser(uploadingEmpId, { imageUrl: webpDataUrl });
          setUploadingEmpId(null);
          showToast('تم رفع الصورة بنجاح');
        } catch (err) {
          console.error('Error saving image:', err);
          alert('تعذر حفظ الصورة، قد تكون الذاكرة ممتلئة. يرجى تجربة صورة أصغر.');
          setUploadingEmpId(null);
        } finally {
          URL.revokeObjectURL(imageUrl); // Free memory
        }
      };
      
      img.src = imageUrl;
    }
  };

  const triggerUpload = (id: string) => {
    setUploadingEmpId(id);
    fileInputRef.current?.click();
  };

  const handleAddEmployee = () => {
    if (!newEmpName.trim()) return;
    const id = 'emp_' + Date.now();
    const branch = effectiveBranch === 'موظفة خارجية' ? 'موظفة خارجية' : effectiveBranch;
    addUser({
      id, name: newEmpName.trim(), branch, email: '', role: 'employee', imageUrl: employeeImg,
      stats: { positive: 0, negative: 0, complaints: 0, safety: 0 }
    });
    setNewEmpName('');
    setShowAddForm(false);
    showToast('تمت إضافة الموظفة بنجاح');
  };

  const handleRemoveEmployee = (id: string) => {
    if (!confirm('هل أنت متأكد من إزالة هذه الموظفة؟')) return;
    removeUser(id);
    showToast('تمت إزالة الموظفة');
  };

  const handleSubmitComplaint = () => {
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
      time: new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }),
      comment: complaintText,
    });
    setComplaintBranch(''); setComplaintEmployee(''); setComplaintText('');
    showToast('تم تسجيل الشكوى بنجاح');
  };

  const handleSubmitSafety = () => {
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
      time: new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }),
      comment: safetyText,
    });
    setSafetyBranch(''); setSafetyEmployee(''); setSafetyText('');
    showToast('تم تسجيل مخالفة السلامة');
  };

  const employeesForBranch = (branch: string) => users.filter(u => u.branch === branch && u.role === 'employee');

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row font-alexandria" dir="rtl">
      {/* Hidden File Input */}
      <input type="file" ref={fileInputRef} className="hidden" accept="image/png,image/jpeg,image/webp,image/*" onChange={handleFileUpload} />

      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] bg-green-600 text-white px-6 py-3 rounded-xl shadow-2xl flex items-center gap-2 animate-fade-in font-bold text-sm">
          <CheckCircle2 size={20} />
          {toast}
        </div>
      )}

      {/* Desktop Sidebar (visible on md:flex, hidden on mobile) */}
      <aside className="hidden md:flex flex-col w-64 lg:w-72 bg-white border-l border-slate-200 h-screen sticky top-0 shrink-0 z-40 shadow-sm">
        {/* Brand / Logo */}
        <div className="p-5 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center font-black text-lg shadow-md shadow-blue-500/20">
              S
            </div>
            <div>
              <h1 className="text-base font-black text-slate-900 leading-tight">أي آم سبيشل</h1>
              <p className="text-[11px] text-blue-600 font-bold">لوحة الإدارة العامة</p>
            </div>
          </div>
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
            <option value="all">🌐 جميع الفروع</option>
            {branches.map(b => (
              <option key={b} value={b}>🏢 فرع {b}</option>
            ))}
            <option value="موظفة خارجية">💼 موظفات خارجيات</option>
          </select>
          {globalBranch !== 'all' ? (
            <p className="text-[11px] text-blue-700 font-medium mt-2 bg-blue-50/80 border border-blue-100 rounded-lg p-1.5 text-center leading-relaxed">
              كافة التبويبات مخصصة لـ <strong>{globalBranch === 'موظفة خارجية' ? 'الموظفات الخارجيات' : `فرع ${globalBranch}`}</strong>
            </p>
          ) : (
            <p className="text-[11px] text-slate-400 font-medium mt-1.5 text-center">
              يتم عرض بيانات جميع الفروع
            </p>
          )}
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto custom-scrollbar">
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
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
          <button
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-xl transition-colors cursor-pointer"
          >
            <LogOut size={14} />
            تسجيل الخروج
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 pb-28 md:pb-10">
        {/* Mobile Header (hidden on md:) */}
        <header className="md:hidden bg-slate-800 text-white p-4 shadow-md sticky top-0 z-30">
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center font-black text-sm">
                S
              </div>
              <h1 className="text-base font-bold">لوحة الإدارة العامة</h1>
            </div>
            <button onClick={logout} className="p-1.5 hover:bg-slate-700 rounded-lg flex items-center gap-1.5 text-xs font-bold text-slate-200">
              <LogOut size={15} />
              خروج
            </button>
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
              <option value="all">🌐 جميع الفروع</option>
              {branches.map(b => (
                <option key={b} value={b}>🏢 فرع {b}</option>
              ))}
              <option value="موظفة خارجية">💼 موظفات خارجيات</option>
            </select>
          </div>
        </header>

        {/* Desktop Top Bar (hidden on mobile) */}
        <header className="hidden md:flex bg-white/95 border-b border-slate-200 px-8 py-4 justify-between items-center sticky top-0 z-20 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-black text-slate-800">
              {navItems.find(i => i.id === activeTab)?.label}
            </h2>
            {globalBranch !== 'all' && (
              <span className="bg-blue-50 text-blue-700 text-xs font-extrabold px-3 py-1 rounded-full border border-blue-200 flex items-center gap-1.5">
                <Building2 size={13} />
                {globalBranch === 'موظفة خارجية' ? 'الموظفات الخارجيات' : `فرع ${globalBranch}`}
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
              <option value="all">🌐 جميع الفروع</option>
              {branches.map(b => (
                <option key={b} value={b}>🏢 فرع {b}</option>
              ))}
              <option value="موظفة خارجية">💼 موظفات خارجيات</option>
            </select>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full">
          <div className="bg-white p-5 md:p-8 rounded-2xl shadow-sm border border-slate-200/80 overflow-x-auto min-h-[75vh]">
          
          {activeTab === 'timeline' && (
            <div>
              <h2 className="text-xl font-bold mb-4 border-b pb-2">الخط الزمني لشفتات الفروع</h2>
              
              {globalBranch === 'all' ? (
                <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
                  {branches.map(b => (
                    <button
                      key={b}
                      onClick={() => setSelectedTimelineBranch(b)}
                      className={`px-4 py-2 rounded-lg font-bold whitespace-nowrap ${selectedTimelineBranch === b ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                    >
                      فرع {b}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-between mb-6 bg-blue-50 border border-blue-200 text-blue-900 px-4 py-3 rounded-xl font-bold text-sm">
                  <span className="flex items-center gap-2">
                    <Building2 size={18} className="text-blue-600" />
                    عرض الخط الزمني لـ {globalBranch === 'موظفة خارجية' ? 'الموظفات الخارجيات' : `فرع ${globalBranch}`}
                  </span>
                  <button onClick={() => handleGlobalBranchChange('all')} className="text-xs bg-white text-blue-700 px-3 py-1.5 rounded-lg border border-blue-200 hover:bg-blue-100 shadow-sm transition">
                    عرض كل الفروع
                  </button>
                </div>
              )}

              <div className="space-y-4 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-300 before:to-transparent mt-8">
                {filteredTimeline.map((item) => (
                  <div key={item.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                    <div className={`flex items-center justify-center w-10 h-10 rounded-full border-4 border-white shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-sm ${item.type === 'gap' ? 'bg-red-500' : item.type === 'review' ? 'bg-yellow-500' : 'bg-green-500'}`}>
                      {item.type === 'gap' ? <AlertOctagon size={16} className="text-white" /> : item.type === 'review' ? <span className="text-white text-xs font-bold">★</span> : <CalendarClock size={16} className="text-white" />}
                    </div>
                    <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-white p-4 rounded-xl border shadow-sm">
                      <div className="flex items-center justify-between mb-1">
                        <h4 className={`font-bold ${item.type === 'gap' ? 'text-red-600' : item.type === 'review' ? 'text-yellow-600' : 'text-green-600'}`}>
                          {item.type === 'review' && item.reviewId ? (
                            (() => {
                              const rev = reviews.find(r => r.id === item.reviewId);
                              return rev ? `تقييم من: ${rev.reviewerName} (${rev.rating})` : item.title;
                            })()
                          ) : (
                            item.title
                          )}
                        </h4>
                        <div className="flex items-center gap-2">
                          <time className="text-xs font-medium text-gray-500">
                            {item.date ? formatDateTime(item.date, item.time) : formatTime(item.time)}
                            {item.endTime && ` - ${formatTime(item.endTime)}`}
                          </time>
                          <button onClick={() => handleDeleteTimelineEvent(item.id, item.reviewId)} className="text-red-400 hover:text-red-600"><Trash2 size={14}/></button>
                        </div>
                      </div>
                      
                      {item.type !== 'review' && item.comment && (
                        <div className="mt-3 border-t pt-3">
                          <p className="text-sm bg-gray-50 p-2 rounded text-gray-700 italic border-r-2 border-red-500 mb-3">
                            {item.title.includes('اعتراض') ? 'الاعتراض: ' : item.title.includes('شكوى') ? 'الشكوى: ' : 'تعليق: '} {item.comment}
                          </p>
                          {item.title.includes('اعتراض') && (
                            <button className="text-xs bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700 font-bold" onClick={() => { showToast('تمت الموافقة وتحديث بيانات الشفت'); }}>معالجة وقبول الاعتراض</button>
                          )}
                        </div>
                      )}

                      {item.type === 'review' && (
                        <div className="mt-3 border-t pt-3">
                          {item.comment && <p className="text-sm bg-gray-50 p-2 rounded text-gray-700 italic border-r-2 border-yellow-500 mb-2">"{item.comment}"</p>}
                          
                          {linkingReviewId === item.id ? (
                            <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 mt-2">
                              <p className="text-sm font-bold mb-2">تحديد الموظفات المرتبطات بهذا التقييم:</p>
                              <div className="grid grid-cols-2 gap-2 mb-3 max-h-32 overflow-y-auto">
                                {allAvailableEmployees.map(emp => (
                                  <label key={emp.id} className="flex items-center gap-2 text-sm cursor-pointer">
                                    <input 
                                      type="checkbox" 
                                      checked={linkingSelection.includes(emp.id)}
                                      onChange={(e) => {
                                        if (e.target.checked) setLinkingSelection(prev => [...prev, emp.id]);
                                        else setLinkingSelection(prev => prev.filter(id => id !== emp.id));
                                      }}
                                    />
                                    {emp.name}
                                  </label>
                                ))}
                              </div>
                              <div className="flex gap-2">
                                <button onClick={() => handleSaveLinking(item.id, item.reviewId)} className="bg-green-600 text-white text-xs px-3 py-1 rounded font-bold">حفظ الربط</button>
                                <button onClick={() => setLinkingReviewId(null)} className="bg-gray-400 text-white text-xs px-3 py-1 rounded">إلغاء</button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between mt-2">
                              <div className="text-sm">
                                {item.employees && item.employees.length > 0 ? (
                                  <span className="text-green-600 font-bold">الموظفات: {item.employees.map(e => e.name).join('، ')}</span>
                                ) : (
                                  <span className="text-red-500 font-bold">التقييم غير مرتبط بأي موظفة!</span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 flex-wrap">
                                {editingTimeId === item.id ? (
                                  <div className="flex items-center gap-1">
                                    <input type="time" value={editingTimeValue} onChange={e => setEditingTimeValue(e.target.value)}
                                      className="text-xs border rounded p-1" />
                                    <button onClick={() => {
                                      updateTimelineEvent(item.id, { time: editingTimeValue });
                                      if (item.reviewId) updateReview(item.reviewId, { time: editingTimeValue });
                                      setEditingTimeId(null);
                                      showToast('تم تحديث وقت التقييم');
                                    }} className="text-xs bg-green-600 text-white px-2 py-1 rounded font-bold">حفظ</button>
                                    <button onClick={() => setEditingTimeId(null)} className="text-xs bg-gray-400 text-white px-2 py-1 rounded">إلغاء</button>
                                  </div>
                                ) : (
                                  <button onClick={() => { setEditingTimeId(item.id); setEditingTimeValue(item.time); }}
                                    className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded font-bold hover:bg-gray-200">
                                    تعديل الوقت
                                  </button>
                                )}
                                <button 
                                  onClick={() => { 
                                    setLinkingReviewId(item.id); 
                                    setLinkingSelection(item.employees ? item.employees.map(e => e.id) : []); 
                                  }}
                                  className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded font-bold hover:bg-blue-200"
                                >
                                  تعديل الربط
                                </button>
                                <button 
                                  onClick={() => handleDeleteTimelineEvent(item.id, item.reviewId)}
                                  className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded font-bold hover:bg-red-200 flex items-center gap-1"
                                >
                                  <Trash2 size={12} /> حذف التقييم
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {filteredTimeline.length === 0 && <p className="text-center text-gray-500 py-10">لا يوجد أحداث في الخط الزمني بعد.</p>}
              </div>
            </div>
          )}

          {activeTab === 'branches' && (
            <div>
              <h2 className="text-xl font-bold mb-6 border-b pb-2">إدارة الفروع</h2>
              
              <div className="space-y-6">
                {(globalBranch === 'all' ? branches : (globalBranch === 'موظفة خارجية' ? [] : [globalBranch])).map(branch => {
                  const currentBranchEmployees = users.filter(u => u.branch === branch && u.role === 'employee');
                  return (
                    <div key={branch} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col gap-6">
                      <div className="flex justify-between items-center border-b pb-4">
                        <div className="flex-1">
                          <label className="block text-sm font-bold text-gray-700 mb-1">اسم الفرع (تعديل)</label>
                          <input type="text" defaultValue={`فرع ${branch}`} className="w-64 p-2 border rounded font-bold text-gray-800 bg-gray-50 focus:bg-white" 
                            onBlur={() => showToast('تعديل اسم الفرع غير مدعوم في هذه النسخة لتجنب تعارض البيانات')} />
                        </div>
                        <div className="text-sm bg-blue-50 text-blue-700 px-4 py-2 rounded-lg font-bold flex items-center gap-2">
                          <Users size={16}/>
                          {currentBranchEmployees.length} موظفات
                        </div>
                      </div>

                      <div className="grid md:grid-cols-2 gap-8">
                        {/* Settings Form */}
                        <div className="bg-gray-50 p-5 rounded-lg border border-gray-100">
                          <h4 className="font-bold text-gray-700 mb-4 border-b pb-2">أوقات العمل الافتراضية</h4>
                          <div className="grid grid-cols-2 gap-4 mb-4">
                            <div>
                              <label className="block text-xs font-bold text-gray-600 mb-1">وقت البدء</label>
                              <input id={`start-${branch}`} type="time" defaultValue={branchSettings[branch]?.start || '16:00'} className="w-full p-2 border rounded" />
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-gray-600 mb-1">وقت الانتهاء (نفس اليوم)</label>
                              <input id={`end-${branch}`} type="time" defaultValue={branchSettings[branch]?.end || '00:00'} className="w-full p-2 border rounded" />
                            </div>
                            <div className="col-span-2">
                              <label className="block text-xs font-bold text-gray-600 mb-1">وقت اليوم التالي</label>
                              <input id={`nextday-${branch}`} type="time" defaultValue={branchSettings[branch]?.nextDayTime || '10:00'} className="w-full p-2 border rounded" />
                            </div>
                            <div className="col-span-2">
                              <label className="block text-xs font-bold text-gray-600 mb-1">رابط Google API</label>
                              <input id={`api-${branch}`} type="text" placeholder="https://..." defaultValue={branchSettings[branch]?.googleApi || ''} className="w-full p-2 border rounded text-left" dir="ltr" />
                            </div>
                          </div>
                          <button onClick={() => {
                            const start = (document.getElementById(`start-${branch}`) as HTMLInputElement).value;
                            const end = (document.getElementById(`end-${branch}`) as HTMLInputElement).value;
                            const nextDayTime = (document.getElementById(`nextday-${branch}`) as HTMLInputElement).value;
                            const googleApi = (document.getElementById(`api-${branch}`) as HTMLInputElement).value;
                            updateBranchSettings(branch, start, end, googleApi, nextDayTime);
                            showToast(`تم حفظ إعدادات فرع ${branch}`);
                          }} className="w-full bg-blue-600 text-white p-3 rounded-lg font-bold hover:bg-blue-700 transition-colors">
                            حفظ إعدادات {branch}
                          </button>
                        </div>

                        {/* Employees List */}
                        <div className="bg-gray-50 p-5 rounded-lg border border-gray-100">
                          <h4 className="font-bold text-gray-700 mb-4 border-b pb-2">موظفات الفرع</h4>
                          <div className="max-h-64 overflow-y-auto space-y-2 pr-2">
                            {currentBranchEmployees.map(emp => (
                              <div key={emp.id} className="flex items-center gap-3 bg-white p-2 rounded-lg border shadow-sm">
                                <img src={emp.imageUrl || employeeImg} alt={emp.name} className="w-10 h-10 rounded-full object-cover border" />
                                <div>
                                  <p className="font-bold text-sm text-gray-800">{emp.name}</p>
                                  <p className="text-xs text-gray-500 mt-1">
                                    <span className="text-green-600 font-bold">{emp.stats.positive.toFixed(1)}</span> إيجابي | <span className="text-red-600 font-bold">{emp.stats.negative.toFixed(1)}</span> سلبي
                                  </p>
                                </div>
                              </div>
                            ))}
                            {currentBranchEmployees.length === 0 && (
                              <p className="text-center text-sm text-gray-500 py-6">لا يوجد موظفات مسجلات في هذا الفرع.</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'employees' && (
            <div>
              <div className="flex justify-between items-center mb-4 border-b pb-2 flex-wrap gap-2">
                <h2 className="text-xl font-bold">إدارة الموظفات</h2>
                <div className="flex gap-2 items-center">
                  <button onClick={() => setShowAddForm(!showAddForm)} className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 text-sm font-bold flex gap-2 items-center">
                    <PlusCircle size={16} /> إضافة موظفة
                  </button>
                </div>
              </div>

              {showAddForm && (
                <div className="mb-6 p-4 bg-green-50 rounded-xl border border-green-200">
                  <h4 className="font-bold text-green-800 mb-3">إضافة موظفة جديدة إلى ({selectedBranch === 'موظفة خارجية' ? 'المصدر الخارجي' : `فرع ${selectedBranch}`})</h4>
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
                  >موظفات خارجيات</button>
                </div>
              )}

              <h3 className="font-bold text-lg mb-4 text-gray-800">
                {effectiveBranch === 'موظفة خارجية' ? 'الموظفات الخارجيات' : `موظفات فرع ${effectiveBranch}`} ({branchEmployees.length})
              </h3>

              {effectiveBranch !== 'موظفة خارجية' && (
                <div className="mb-5 p-4 bg-blue-50 border border-blue-100 rounded-xl">
                  <h4 className="font-bold text-blue-900 mb-2">الأسماء المثبتة في المحادثة — {effectiveBranch} ({users.filter(account => account.role === 'employee' && (account.branch === effectiveBranch || account.assignedBranches?.includes(effectiveBranch))).length})</h4>
                  <p className="text-sm text-blue-800">{users.filter(account => account.role === 'employee' && (account.branch === effectiveBranch || account.assignedBranches?.includes(effectiveBranch))).map(person => person.name + (person.code ? ` (${person.code})` : '')).join('، ')}</p>
                  <p className="text-xs text-gray-600 mt-2">تشمل موظفات التغطية المسجلات في قسم الموظفات الخارجيات. القائمة تاريخية للفترة من 2 أغسطس إلى 15 أكتوبر، ولا تعني استمرار جميع الموظفات حاليًا.</p>
                </div>
              )}

              {selectedBranch === 'موظفة خارجية' && (
                <p className="text-sm text-purple-600 mb-4 bg-purple-50 p-3 rounded-lg border border-purple-100">
                  الموظفات الخارجيات يمكن أن يعملن في أي فرع ويجمعن تقييمات من عدة فروع.
                </p>
              )}
              
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse min-w-[700px]">
                  <thead>
                    <tr className="bg-gray-100 text-xs">
                      <th className="p-2 border">الصورة</th>
                      <th className="p-2 border">الموظفة</th>
                      <th className="p-2 border">الفرع (نقل)</th>
                      <th className="p-2 border" title="إجمالي التقييمات">كلي</th>
                      <th className="p-2 border" title="تقييمات الشهر">الشهر</th>
                      <th className="p-2 border" title="نقاط إيجابية">إيجابي</th>
                      <th className="p-2 border" title="نقاط سلبية">سلبي</th>
                      <th className="p-2 border" title="الشكاوى">شكاوى</th>
                      <th className="p-2 border" title="السلامة">سلامة</th>
                      <th className="p-2 border">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {branchEmployees.map(emp => (
                      <tr key={emp.id} className="border-b hover:bg-gray-50">
                        <td className="p-3 border text-center w-20 relative group cursor-pointer" onClick={() => triggerUpload(emp.id)}>
                          <div className="w-12 h-12 mx-auto rounded-full overflow-hidden border-2 border-gray-200 bg-gray-50 flex items-center justify-center relative">
                            <img src={emp.imageUrl || employeeImg} alt={emp.name} className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-all flex items-center justify-center">
                              <Upload className="text-white opacity-0 group-hover:opacity-100 transition-opacity" size={16} />
                            </div>
                          </div>
                        </td>
                        <td className="p-3 border">
                          <input type="text" defaultValue={emp.name} onBlur={(e) => { updateUser(emp.id, { name: e.target.value }); showToast('تم تحديث الاسم'); }}
                            className="w-full p-1 border rounded bg-transparent focus:bg-white font-bold" />
                        </td>
                        <td className="p-3 border">
                          <select value={emp.branch} onChange={(e) => handleTransfer(emp.id, e.target.value)}
                            className="w-full p-1 border rounded bg-transparent focus:bg-white text-sm">
                            {branches.map(b => <option key={b} value={b}>{b}</option>)}
                            <option value="موظفة خارجية">خارجية</option>
                          </select>
                        </td>
                        <td className="p-2 border w-16">
                          <input type="number" defaultValue={emp.reviewsCount || 0}
                            onBlur={(e) => handleUpdateStats(emp.id, 'totalReviews', parseInt(e.target.value) || 0)}
                            className="w-full p-1 border rounded text-center focus:bg-white text-blue-600 font-bold text-xs" />
                        </td>
                        <td className="p-2 border w-16">
                          <input type="number" defaultValue={emp.monthReviewsCount || 0}
                            onBlur={(e) => handleUpdateStats(emp.id, 'monthReviews', parseInt(e.target.value) || 0)}
                            className="w-full p-1 border rounded text-center focus:bg-white text-blue-600 font-bold text-xs" />
                        </td>
                        <td className="p-2 border w-16">
                          <input type="number" step="0.25" defaultValue={emp.stats.positive}
                            onBlur={(e) => handleUpdateStats(emp.id, 'positive', parseFloat(e.target.value) || 0)}
                            className="w-full p-1 border rounded text-center focus:bg-white text-green-600 font-bold text-xs" />
                        </td>
                        <td className="p-2 border w-16">
                          <input type="number" step="0.5" defaultValue={emp.stats.negative}
                            onBlur={(e) => handleUpdateStats(emp.id, 'negative', parseFloat(e.target.value) || 0)}
                            className="w-full p-1 border rounded text-center focus:bg-white text-red-600 font-bold text-xs" />
                        </td>
                        <td className="p-2 border w-16">
                          <input type="number" defaultValue={emp.stats.complaints}
                            onBlur={(e) => handleUpdateStats(emp.id, 'complaints', parseInt(e.target.value) || 0)}
                            className="w-full p-1 border rounded text-center focus:bg-white text-orange-600 font-bold text-xs" />
                        </td>
                        <td className="p-2 border w-16">
                          <input type="number" defaultValue={emp.stats.safety}
                            onBlur={(e) => handleUpdateStats(emp.id, 'safety', parseInt(e.target.value) || 0)}
                            className="w-full p-1 border rounded text-center focus:bg-white text-orange-600 font-bold text-xs" />
                        </td>
                        <td className="p-2 border text-center w-20">
                          <button onClick={() => handleRemoveEmployee(emp.id)} className="text-xs text-red-600 hover:underline font-bold">إزالة</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'notes' && (
            <div>
              <div className="flex items-center gap-3 mb-6 border-b pb-4">
                <MessageSquareWarning className="text-gray-800" size={28} />
                <h2 className="text-2xl font-bold text-gray-800">إدارة الملاحظات</h2>
              </div>
              
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
                      {complaintBranch && employeesForBranch(complaintBranch).map(e => <option key={e.id} value={e.name}>{e.name}</option>)}
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
                      {safetyBranch && employeesForBranch(safetyBranch).map(e => <option key={e.id} value={e.name}>{e.name}</option>)}
                    </select>
                    <textarea placeholder="وصف المخالفة..." value={safetyText} onChange={e => setSafetyText(e.target.value)} className="w-full p-2 border rounded-lg bg-white h-24"></textarea>
                    <button onClick={handleSubmitSafety} className="w-full bg-orange-600 text-white py-2 rounded-lg font-bold hover:bg-orange-700">اعتماد المخالفة</button>
                  </div>
                </div>
              </div>

              <h3 className="font-bold text-lg mb-4 text-gray-800 border-b pb-2">السجل الأخير</h3>
              <div className="grid gap-4">
                {timeline.filter(t => (globalBranch !== 'all' ? t.branch === globalBranch : true) && (t.title.includes('شكوى') || t.title.includes('سلامة') || t.title.includes('مخالفة'))).slice(0, 15).map(t => (
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

          {activeTab === 'stats' && (
            <div>
              <div className="flex items-center gap-3 mb-6 border-b pb-4">
                <BarChart3 className="text-blue-600" size={28} />
                <h2 className="text-2xl font-bold text-gray-800">الإحصائيات والتقييمات</h2>
              </div>

              <div className="bg-blue-50 p-6 rounded-xl border border-blue-100 mb-8 shadow-sm">
                <h3 className="font-bold text-blue-900 mb-4 text-lg">حقن التقييمات للفرع</h3>
                <div className="mb-4">
                  <label className="block text-sm font-bold text-blue-800 mb-2">اختر الفرع لتسجيل التقييمات</label>
                  <select value={effectiveBranch} onChange={e => setSelectedBranch(e.target.value)} disabled={globalBranch !== 'all'} className="w-full p-3 border border-blue-200 rounded-lg">
                    {branches.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                <div className="mb-4">
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-sm font-bold text-blue-800">النص البرمجي للتقييمات</label>
                    <button 
                      onClick={() => {
                        const template = `معرف التقييم: AbFvOqnT5uVK9_z5olmKcjV1GqNFGJoL5u9rUe2jxJbgdcAHlY-lLODv3Or2Eg6a_f2xndM-cYzl\nاسم المقيم: علي احمد\nالتقييم: 5 نجوم\nالتعليق: مكان جميل جدا\nالتاريخ: 06-07-2026\nالوقت: 14:23`;
                        navigator.clipboard.writeText(template);
                        showToast('تم نسخ النموذج');
                      }}
                      className="text-xs bg-blue-100 text-blue-700 px-3 py-1 rounded hover:bg-blue-200 font-bold flex items-center gap-1"
                    >
                      📋 نسخ النموذج
                    </button>
                  </div>
                  <textarea 
                    value={reviewsText} 
                    onChange={e => setReviewsText(e.target.value)}
                    placeholder="الصق التقييمات هنا بالصيغة المطلوبة...&#10;مثال:&#10;معرف التقييم: Abc...&#10;اسم المقيم: أحمد..."
                    className="w-full h-32 p-4 border border-blue-200 rounded-lg text-left bg-white font-mono text-sm leading-relaxed" dir="rtl"
                  ></textarea>
                </div>

                {pendingReviews && (
                  <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <h4 className="font-bold text-blue-800 mb-3 text-sm">مراجعة التقييمات المستخرجة ({pendingReviews.reviews.length})</h4>
                    <div className="max-h-60 overflow-y-auto space-y-2 mb-4 pr-2 custom-scrollbar">
                      {pendingReviews.reviews.map(r => {
                        const linkedEmpNames = r.linkedEmployeeIds.map((id: string) => users.find(u => u.id === id)?.name || id).join('، ');
                        return (
                          <div key={r.id} className="flex justify-between items-center p-3 bg-white rounded border border-blue-100">
                            <div>
                              <div className="font-bold text-sm text-gray-800">{r.reviewerName} - {r.rating}</div>
                              <div className="text-xs text-gray-500 mt-1">
                                {linkedEmpNames ? `سيتم ربط: ${linkedEmpNames}` : 'لن يتم ربط أي موظفة تلقائياً'}
                              </div>
                            </div>
                            <button onClick={() => handleRemovePendingReview(r.id)} className="text-red-500 hover:text-red-700 p-1 font-bold">✖</button>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={handleConfirmReviews} className="flex-1 bg-green-600 text-white p-2 rounded-lg font-bold hover:bg-green-700 text-sm">اعتماد التقييمات</button>
                      <button onClick={() => setPendingReviews(null)} className="flex-1 bg-gray-500 text-white p-2 rounded-lg font-bold hover:bg-gray-600 text-sm">إلغاء</button>
                    </div>
                  </div>
                )}

                {!pendingReviews && (
                  <button onClick={handleInjectReviews} className="w-full bg-blue-600 text-white p-3 rounded-lg font-bold hover:bg-blue-700 text-md flex items-center justify-center gap-2 shadow-sm mb-6">
                    <CheckCircle2 size={18} />
                    استخراج ومراجعة التقييمات
                  </button>
                )}

                <div className="mb-4 pt-4 border-t border-blue-200">
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-sm font-bold text-blue-800">النص البرمجي للشفتات</label>
                    <button 
                      onClick={() => {
                        const template = `وقت البداية: ١٦:٠٠ ٠٢-٠٣-٢٠٢٦\nوقت النهاية: ١١:٥٩ ٠٣-٠٣-٢٠٢٦\nالموظفات: (موظفة أولى)(موظفة ثانية)`;
                        navigator.clipboard.writeText(template);
                        showToast('تم نسخ النموذج');
                      }}
                      className="text-xs bg-blue-100 text-blue-700 px-3 py-1 rounded hover:bg-blue-200 font-bold flex items-center gap-1"
                    >
                      📋 نسخ النموذج
                    </button>
                  </div>
                  <textarea 
                    value={shiftsText} 
                    onChange={e => { setShiftsText(e.target.value); setPendingShifts([]); setUnmatchedShiftNames([]); setShiftMappings({}); }}
                    placeholder="الصق الشفتات هنا بالصيغة المطلوبة...&#10;مثال:&#10;وقت البداية: ١٦:٠٠ ٠٢-٠٣-٢٠٢٦..."
                    className="w-full h-32 p-4 border border-blue-200 rounded-lg text-left bg-white font-mono text-sm leading-relaxed" dir="rtl"
                  ></textarea>
                </div>

                {pendingShifts.length > 0 && (
                  <div className="mb-4 p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
                    <h4 className="font-bold text-indigo-800 mb-3 text-sm">مراجعة الشفتات المستخرجة ({pendingShifts.length})</h4>
                    <div className="max-h-60 overflow-y-auto space-y-2 mb-4 pr-2 custom-scrollbar">
                      {pendingShifts.map((s, idx) => {
                        // Estimate how many reviews this shift will capture (unlinked reviews in this time window)
                        const sTime = parseInt(toEnglishNumerals(s.time).replace(':', ''));
                        const eTime = parseInt(s.endTime.replace(':', ''));
                        let reviewsCount = 0;
                        reviews.filter(r => r.branch === selectedBranch && r.linkedEmployeeIds.length === 0).forEach(r => {
                          const rTime = parseInt(toEnglishNumerals(r.time).replace(':', ''));
                          if (eTime < sTime) { // Cross midnight
                            if (rTime >= sTime || rTime <= eTime) reviewsCount++;
                          } else {
                            if (rTime >= sTime && rTime <= eTime) reviewsCount++;
                          }
                        });
                        
                        return (
                          <div key={s.id || idx} className="flex justify-between items-center p-3 bg-white rounded border border-indigo-100">
                            <div>
                              <div className="font-bold text-sm text-gray-800">{formatDate(s.date)} <span className="text-xs font-medium">({shiftName(s.time)})</span></div>
                              <div className="text-xs text-gray-500 mt-1">
                                {s.employees.map((e: any) => e.name).join('، ')}
                              </div>
                              <div className="text-xs text-indigo-600 mt-1 font-bold">
                                سيلتقط {reviewsCount} تقييم (تقريبي)
                              </div>
                            </div>
                            <button onClick={() => handleRemovePendingShift(s.id)} className="text-red-500 hover:text-red-700 p-1 font-bold">✖</button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {unmatchedShiftNames.length > 0 && (
                  <div className="mb-4 p-4 bg-orange-50 border border-orange-200 rounded-lg">
                    <h4 className="font-bold text-orange-800 mb-3 text-sm">أسماء غير مرتبطة في الشفتات</h4>
                    <div className="space-y-3">
                      {unmatchedShiftNames.map(name => (
                        <div key={name} className="flex flex-col sm:flex-row items-center gap-2">
                          <span className="font-bold text-orange-900 min-w-[100px]">{name}</span>
                          <select 
                            value={shiftMappings[name] || ''}
                            onChange={(e) => setShiftMappings(prev => ({...prev, [name]: e.target.value}))}
                            className="flex-1 p-2 border rounded text-sm bg-white"
                          >
                            <option value="" disabled>اختر موظفة للربط...</option>
                            <option value="new" className="font-bold text-green-600">+ إضافة كموظفة جديدة</option>
                            {allAvailableEmployees.map(u => (
                              <option key={u.id} value={u.id}>{u.name}</option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {pendingShifts.length > 0 ? (
                  <div className="flex gap-2">
                    <button onClick={handleConfirmShifts} className="flex-1 bg-green-600 text-white p-3 rounded-lg font-bold hover:bg-green-700 text-md flex items-center justify-center gap-2 shadow-sm">
                      <CheckCircle2 size={18} />
                      اعتماد الشفتات
                    </button>
                    <button onClick={() => { setPendingShifts([]); setUnmatchedShiftNames([]); }} className="flex-1 bg-gray-500 text-white p-3 rounded-lg font-bold hover:bg-gray-600 text-md">
                      إلغاء
                    </button>
                  </div>
                ) : (
                  <button onClick={handleParseShifts} className="w-full bg-indigo-600 text-white p-3 rounded-lg font-bold hover:bg-indigo-700 text-md flex items-center justify-center gap-2 shadow-sm">
                    <CalendarClock size={18} />
                    استخراج ومراجعة الشفتات
                  </button>
                )}
              </div>

              <h3 className="font-bold text-xl mb-6 border-b pb-2 flex items-center gap-2 text-gray-800">
                <Activity className="text-gray-500"/> استعراض تقييمات الفروع
              </h3>
              
              {globalBranch === 'all' ? (
                <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
                  {branches.map(b => (
                    <button
                      key={b}
                      onClick={() => { setSelectedTimelineBranch(b); setViewingReviewsMonth(''); }}
                      className={`px-4 py-2 rounded-lg font-bold whitespace-nowrap ${selectedTimelineBranch === b ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                    >
                      فرع {b}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-between mb-6 bg-blue-50 border border-blue-200 text-blue-900 px-4 py-3 rounded-xl font-bold text-sm">
                  <span>عرض تقييمات {globalBranch === 'موظفة خارجية' ? 'الموظفات الخارجيات' : `فرع ${globalBranch}`}</span>
                  <button onClick={() => handleGlobalBranchChange('all')} className="text-xs bg-white text-blue-700 px-3 py-1.5 rounded-lg border border-blue-200 hover:bg-blue-100 shadow-sm transition">
                    عرض كل الفروع
                  </button>
                </div>
              )}
              
              <div className="mb-6 flex justify-between items-center bg-gray-50 p-4 rounded-xl border">
                <h4 className="font-bold text-gray-700">التقييمات المسجلة: {reviews.filter(r => r.branch === selectedTimelineBranch).length}</h4>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500 font-bold">الفلترة:</span>
                  <select 
                    value={viewingReviewsMonth} 
                    onChange={e => setViewingReviewsMonth(e.target.value)}
                    className="p-2 border rounded-lg bg-white text-sm font-bold"
                  >
                    <option value="">جميع الأشهر</option>
                    {Array.from(new Set(reviews.filter(r => r.branch === selectedTimelineBranch).map(r => r.date.substring(3)))).map(m => (
                      <option key={m as string} value={m as string}>{m as string}</option>
                    ))}
                  </select>
                </div>
              </div>
              
              <div className="grid gap-4 md:grid-cols-2">
                {reviews.filter(r => r.branch === selectedTimelineBranch && (viewingReviewsMonth ? r.date.endsWith(viewingReviewsMonth) : true)).map(r => (
                  <div key={r.id} className="bg-white p-5 rounded-xl border shadow-sm flex flex-col gap-3 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-2 h-full bg-yellow-400"></div>
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xl shrink-0">
                        {r.reviewerName.charAt(0)}
                      </div>
                      <div className="flex-1">
                        <h5 className="font-bold text-lg text-gray-800">{r.reviewerName}</h5>
                        <div className="flex gap-1 text-yellow-400 my-1 text-xs">
                          ★★★★★
                        </div>
                        <p className="text-gray-700 text-sm mt-2 leading-relaxed">"{r.comment}"</p>
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
                      <div className="flex items-center gap-1 font-medium bg-gray-50 px-2 py-1 rounded">
                        <CalendarClock size={12}/> {formatDateTime(r.date, r.time)}
                      </div>
                      {r.linkedEmployeeIds && r.linkedEmployeeIds.length > 0 ? (
                        <div className="flex items-center gap-1 font-bold text-green-700 bg-green-50 px-2 py-1 rounded border border-green-100">
                          <Users size={12}/> {r.linkedEmployeeIds.map(id => users.find(u => u.id === id)?.name).join('، ')}
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 font-bold text-red-600 bg-red-50 px-2 py-1 rounded border border-red-100">
                          غير مرتبط
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {reviews.filter(r => r.branch === selectedTimelineBranch).length === 0 && (
                  <div className="col-span-full text-center text-gray-500 py-12 border-dashed border-2 rounded-xl flex flex-col items-center gap-3">
                    <BarChart3 size={48} className="text-gray-300"/>
                    <p className="font-bold text-lg">لا توجد تقييمات محقونة لهذا الفرع بعد.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div>
              <h2 className="text-xl font-bold mb-6 border-b pb-2 flex items-center gap-2 text-gray-800">
                <History className="text-gray-500" /> سجل عمليات الحقن
              </h2>
              {injectionBatches.length === 0 ? (
                <div className="text-center text-gray-500 p-8 bg-gray-50 rounded-xl">لا توجد عمليات حقن سابقة مسجلة.</div>
              ) : (
                <div className="space-y-4">
                  {injectionBatches.filter(b => globalBranch !== 'all' ? b.branch === globalBranch : true).map(batch => (
                    <div key={batch.id} className="flex justify-between items-center p-4 bg-white rounded-xl border border-gray-200 shadow-sm">
                      <div>
                        <div className="font-bold text-gray-800 flex items-center gap-2">
                          {batch.type === 'review' ? <span className="text-yellow-600">★ تقييمات</span> : <span className="text-indigo-600">⏱ شفتات</span>}
                          - فرع {batch.branch}
                        </div>
                        <div className="text-sm text-gray-500 mt-1">
                          تاريخ العملية: {formatTimestamp(batch.time)}
                        </div>
                        <div className="text-sm text-gray-600 mt-1 font-bold">
                          العدد المحقون: {batch.count}
                        </div>
                      </div>
                      <button onClick={() => handleUndoBatch(batch.id)} className="flex items-center gap-2 bg-red-100 text-red-600 px-4 py-2 rounded-lg font-bold hover:bg-red-200">
                        <Undo2 size={16} /> تراجع
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

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
              <div className="space-y-4">
                {timeline.filter(t => t.branch === selectedTimelineBranch && t.type === 'shift').map(s => {
                  const linkedReviewsCount = reviews.filter(r => r.linkedShiftId === s.id || (r.branch === s.branch && r.time >= s.time && (s.endTime ? r.time <= s.endTime : true) && r.linkedShiftId === undefined)).length;
                  return (
                    <div key={s.id} className="bg-white p-4 rounded-xl border border-indigo-100 shadow-sm flex flex-col md:flex-row justify-between md:items-center gap-4">
                      <div>
                        <div className="font-bold text-gray-800 text-lg flex items-center gap-2">
                          {formatDate(s.date)} <span className="text-xs font-medium text-gray-500">({shiftName(s.time)})</span>
                          <p className="text-xs text-gray-500">{formatTime(s.time)} – {s.endTime ? formatTime(s.endTime) : 'نهاية اليوم'}</p>
                        </div>
                        <div className="text-sm text-gray-500 mt-2 flex flex-wrap gap-1">
                          {s.employees?.map(e => (
                            <span key={e.id} className="bg-indigo-50 text-indigo-700 px-2 py-1 rounded text-xs font-bold">{e.name}</span>
                          ))}
                        </div>
                      </div>
                      <div className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-center font-bold flex flex-col justify-center items-center min-w-[100px]">
                        <span className="text-2xl">{linkedReviewsCount}</span>
                        <span className="text-xs">تقييمات مرتبطة</span>
                      </div>
                    </div>
                  );
                })}
                {timeline.filter(t => t.branch === selectedTimelineBranch && t.type === 'shift').length === 0 && (
                  <div className="text-center text-gray-500 py-12 border-dashed border-2 rounded-xl flex flex-col items-center gap-3">
                    <CalendarClock size={48} className="text-gray-300"/>
                    <p className="font-bold text-lg">لا توجد شفتات مسجلة لهذا الفرع.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'danger' && (
            <div>
              <div className="flex items-center gap-3 mb-6 border-b pb-4">
                <ShieldAlert className="text-red-600" size={28} />
                <h2 className="text-2xl font-bold text-red-700">منطقة الخطر</h2>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div className="bg-red-50 p-6 rounded-xl border border-red-200 shadow-sm">
                  <h3 className="font-bold text-red-900 mb-2 flex items-center gap-2">
                    <Trash2 size={20} /> حذف بيانات فرع بالكامل
                  </h3>
                  <p className="text-sm text-red-700 mb-4">هذا الإجراء سيقوم بحذف جميع التقييمات والشفتات والملاحظات الخاصة بالفرع المحدد نهائياً، وسيتم خصم النقاط المرتبطة بها من الموظفات.</p>
                  
                  <div className="flex flex-col gap-3">
                    <select id="dangerBranch" className="p-3 border border-red-300 rounded-lg bg-white">
                      <option value="all">جميع الفروع (تنبيه!)</option>
                      {branches.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                    <button onClick={() => {
                      const sel = (document.getElementById('dangerBranch') as HTMLSelectElement).value;
                      if (confirm(`هل أنت متأكد من حذف كافة بيانات ${sel === 'all' ? 'جميع الفروع' : sel}؟ لا يمكن التراجع عن هذا الإجراء.`)) {
                         clearData(sel);
                         showToast('تم حذف البيانات بنجاح');
                      }
                    }} className="bg-red-600 text-white p-3 rounded-lg font-bold hover:bg-red-700">
                      حذف البيانات
                    </button>
                  </div>
                </div>

                <div className="bg-red-50 p-6 rounded-xl border border-red-200 shadow-sm">
                  <h3 className="font-bold text-red-900 mb-2 flex items-center gap-2">
                    <CalendarClock size={20} /> حذف بيانات فترة محددة
                  </h3>
                  <p className="text-sm text-red-700 mb-4">اختر النطاق الزمني لحذف كافة البيانات (تقييمات، شفتات) ضمن هذه الفترة فقط للفرع المحدد.</p>
                  
                  <div className="flex flex-col gap-3">
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="block text-xs font-bold text-red-800 mb-1">من تاريخ</label>
                        <input type="date" id="dangerStart" className="w-full p-2 border border-red-300 rounded-lg" />
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs font-bold text-red-800 mb-1">إلى تاريخ</label>
                        <input type="date" id="dangerEnd" className="w-full p-2 border border-red-300 rounded-lg" />
                      </div>
                    </div>
                    <select id="dangerPeriodBranch" className="p-2 border border-red-300 rounded-lg bg-white">
                      <option value="all">جميع الفروع</option>
                      {branches.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                    <button onClick={() => {
                      const branch = (document.getElementById('dangerPeriodBranch') as HTMLSelectElement).value;
                      const start = (document.getElementById('dangerStart') as HTMLInputElement).value;
                      const end = (document.getElementById('dangerEnd') as HTMLInputElement).value;
                      if (!start || !end) { showToast('يرجى تحديد فترة صحيحة'); return; }
                      if (confirm(`هل أنت متأكد من حذف البيانات للفترة ${formatDate(start)} إلى ${formatDate(end)} لـ ${branch === 'all' ? 'جميع الفروع' : branch}؟`)) {
                         clearData(branch, start, end);
                         showToast('تم حذف بيانات الفترة بنجاح');
                      }
                    }} className="bg-red-600 text-white p-3 rounded-lg font-bold hover:bg-red-700">
                      حذف بيانات الفترة
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 p-6 rounded-xl border border-gray-200 shadow-sm">
                <h3 className="font-bold text-gray-800 mb-2 flex items-center gap-2">
                  <Upload size={20} /> تصدير نسخة احتياطية
                </h3>
                <p className="text-sm text-gray-600 mb-4">يمكنك تحميل كافة البيانات (التقييمات، الشفتات، الموظفين، والإعدادات) كملف JSON آمن للاحتفاظ به.</p>
                <button onClick={() => {
                   const data = {
                      users, reviews, timeline, branchSettings
                   };
                   const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                   const url = URL.createObjectURL(blob);
                   const a = document.createElement('a');
                   a.href = url;
                   a.download = `backup_reviews_system_${new Date().toISOString().split('T')[0]}.json`;
                   a.click();
                   URL.revokeObjectURL(url);
                   showToast('تم تحميل النسخة الاحتياطية بنجاح');
                }} className="bg-gray-800 text-white px-6 py-3 rounded-lg font-bold hover:bg-black w-full sm:w-auto">
                  تصدير كافة البيانات (JSON)
                </button>
              </div>
            </div>
          )}

          {/* Windsor.ai Integration Tab */}
          {activeTab === 'windsor' && (
            <div className="space-y-6">
              {/* Header Banner */}
              <div className="bg-gradient-to-r from-purple-700 via-indigo-700 to-blue-700 text-white p-6 rounded-2xl shadow-lg relative overflow-hidden">
                <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div>
                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-xs font-bold mb-2">
                      <Zap size={14} className="text-yellow-300 fill-yellow-300" />
                      تكامل Windsor.ai
                    </div>
                    <h2 className="text-2xl font-black">جلب واستدعاء التقييمات الآلي من Windsor.ai</h2>
                    <p className="text-purple-100 text-sm mt-1 max-w-2xl">
                      جلب تقييمات Google Business Profile عبر Windsor.ai وربطها بشفتات الموظفات حسب الفرع والتاريخ والوقت.
                    </p>
                  </div>

                  <button
                    onClick={async () => {
                      setIsFetchingWindsor(true);
                      setWindsorStatusMsg(null);
                      const res = await fetchAndProcessWindsorReviews();
                      setIsFetchingWindsor(false);
                      if (res.success) {
                        setWindsorStatusMsg({ text: res.count > 0 ? `تم جلب وحقن ${res.count} تقييمات جديدة بنجاح!` : 'لا توجد تقييمات جديدة في Windsor.ai', type: 'success' });
                      } else {
                        setWindsorStatusMsg({ text: res.error || 'حدث خطأ أثناء الجلب', type: 'error' });
                      }
                    }}
                    disabled={isFetchingWindsor}
                    className="bg-amber-400 hover:bg-amber-300 text-gray-900 font-extrabold px-6 py-3.5 rounded-xl shadow-md transition duration-200 flex items-center gap-2 disabled:opacity-50 shrink-0 cursor-pointer"
                  >
                    <RefreshCw size={20} className={isFetchingWindsor ? 'animate-spin' : ''} />
                    {isFetchingWindsor ? 'جاري الاستدعاء...' : 'جلب التقييمات من Windsor.ai الآن'}
                  </button>
                </div>
              </div>

              {verifiedImportReport && (
                <section className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 space-y-3">
                  <h3 className="font-bold text-emerald-900">تم استيراد نسخة Windsor.ai الفعلية</h3>
                  <p className="text-sm text-emerald-900">الفترة: {formatDate(verifiedImportReport.dateFrom)} إلى {formatDate(verifiedImportReport.dateTo)} — {verifiedImportReport.received} تقييمًا بمعرفات Google الأصلية.</p>
                  <p className="text-sm">مرتبطة بالشفتات: {verifiedImportReport.linked} — دون شفت مطابق: {verifiedImportReport.unlinked}. المضافة: {verifiedImportReport.added}، الموجودة مسبقًا: {verifiedImportReport.alreadyPresent}.</p>
                  {verifiedImportReport.archived > 0 && <p className="text-xs text-gray-700">حُفظت {verifiedImportReport.archived} من التقييمات السابقة المرفقة بالتطبيق في الأرشيف، مع نسخة كاملة من البيانات قبل الاستيراد.</p>}
                  <table className="w-full text-sm text-right"><thead><tr><th>الفرع</th><th>التقييمات</th><th>مرتبطة</th><th>دون ربط</th></tr></thead><tbody>
                    {Object.entries(verifiedImportReport.branches).map(([branch, stats]) => <tr key={branch} className="border-t border-emerald-100"><td className="py-2">{branch}</td><td>{stats.total}</td><td>{stats.linked}</td><td>{stats.unlinked}</td></tr>)}
                  </tbody></table>
                  <p className="text-xs text-gray-600">حُفظت في بيانات التطبيق المحلية. التقييمات دون ربط تبقى محفوظة للمراجعة ولا تُنسب إلى موظفات افتراضيًا.</p>
                </section>
              )}

              {/* Status Message Alert */}
              {windsorStatusMsg && (
                <div className={`p-4 rounded-xl font-bold flex items-center justify-between shadow-sm ${windsorStatusMsg.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                  <div className="flex items-center gap-2">
                    {windsorStatusMsg.type === 'success' ? <CheckCircle2 size={20} className="text-emerald-600" /> : <AlertOctagon size={20} className="text-red-600" />}
                    <span>{windsorStatusMsg.text}</span>
                  </div>
                  <button onClick={() => setWindsorStatusMsg(null)} className="text-xs opacity-60 hover:opacity-100">إغلاق</button>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* API Settings Card */}
                <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-5">
                  <div className="flex items-center gap-3 border-b border-gray-100 pb-4">
                    <div className="p-3 bg-purple-50 text-purple-600 rounded-xl">
                      <Link size={24} />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 text-lg">إعدادات Windsor.ai API</h3>
                      <p className="text-xs text-gray-500">أدخل رابط استعلام Google Business Profile من Windsor.ai ثم احفظ الإعدادات قبل الجلب.</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">🔗 رابط API (الحساب الأول / الفرع 1):</label>
                      <input
                        type="url"
                        placeholder="https://connectors.windsor.ai/google_my_business?api_key=..."
                        value={tempWindsorUrl}
                        onChange={(e) => setTempWindsorUrl(e.target.value)}
                        className="w-full px-4 py-2 bg-gray-50 border border-gray-300 rounded-xl text-xs font-mono focus:bg-white focus:ring-2 focus:ring-purple-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">🔗 رابط API (الحساب الثاني / الفرع 2):</label>
                      <input
                        type="url"
                        placeholder="https://connectors.windsor.ai/google_my_business?api_key=..."
                        value={tempWindsorUrl2}
                        onChange={(e) => setTempWindsorUrl2(e.target.value)}
                        className="w-full px-4 py-2 bg-gray-50 border border-gray-300 rounded-xl text-xs font-mono focus:bg-white focus:ring-2 focus:ring-purple-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">ربط معرفات المواقع بالفروع (JSON)</label>
                      <textarea aria-label="ربط مواقع Windsor بالفروع" dir="ltr" value={mappingText} onChange={e => setMappingText(e.target.value)} placeholder={'{"locations/معرف_الموقع": "جاليري"}'} className="w-full p-3 border rounded-xl text-xs font-mono" rows={7} />
                      <p className="text-xs text-gray-500">استخدم account_id لكل موقع. لا يمكن تحديد الفرع من اسم النشاط إذا تكرر بين المواقع.</p>
                    </div>

                    <button
                      onClick={() => {
                        try {
                          const mapping = JSON.parse(mappingText);
                          if (!mapping || Array.isArray(mapping) || typeof mapping !== 'object' || Object.values(mapping).some(b => typeof b !== 'string' || !branches.includes(b))) throw new Error();
                          setWindsorBranchMapping(mapping);
                        } catch { showToast('أدخل ربط المواقع بصيغة JSON صحيحة وبأسماء الفروع المعتمدة'); return; }
                        setWindsorApiUrl(tempWindsorUrl);
                        setWindsorApiUrl2(tempWindsorUrl2);
                        showToast('تم حفظ روابط Windsor.ai بنجاح');
                      }}
                      className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-2.5 rounded-xl shadow-sm transition text-xs"
                    >
                      حفظ الروابط
                    </button>
                  </div>

                  <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-gray-900">المزامنة التلقائية (Auto-Sync Interval)</h4>
                      <p className="text-xs text-gray-500">التحقق التلقائي واستدعاء التقييمات كل 10 دقائق</p>
                    </div>
                    <button
                      onClick={() => {
                        const newVal = !windsorAutoSync;
                        setWindsorAutoSync(newVal);
                        showToast(newVal ? 'تم تفعيل المزامنة الآلية مع Windsor.ai' : 'تم إيقاف المزامنة الآلية');
                      }}
                      className={`relative inline-flex h-7 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${windsorAutoSync ? 'bg-emerald-500' : 'bg-gray-300'}`}
                    >
                      <span className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${windsorAutoSync ? '-translate-x-7' : 'translate-x-0'}`} />
                    </button>
                  </div>
                </div>

                {/* Windsor.ai Payload Guidelines */}
                <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
                  <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
                        <Globe size={24} />
                      </div>
                      <div>
                        <h3 className="font-bold text-gray-900 text-lg">استعلام تقييمات Windsor.ai</h3>
                        <p className="text-xs text-gray-500">انسخ الاستعلام وأدخل مفتاحك في الرابط من حساب Windsor.ai. الروابط محفوظة محليًا في هذا المتصفح.</p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        const schemaText = WINDSOR_API_EXAMPLE;
                        navigator.clipboard.writeText(schemaText);
                        setCopiedSchema(true);
                        setTimeout(() => setCopiedSchema(false), 2000);
                        showToast('تم نسخ نموذج JSON للقصاصة');
                      }}
                      className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition"
                    >
                      {copiedSchema ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                      {copiedSchema ? 'تم النسخ' : 'نسخ النموذج'}
                    </button>
                  </div>

                  <div className="bg-slate-900 text-slate-200 p-4 rounded-xl text-xs font-mono overflow-x-auto dir-ltr">
                    <pre className="whitespace-pre-wrap break-all">{WINDSOR_API_EXAMPLE}</pre>
                  </div>

                  <div className="text-xs text-gray-600 space-y-1.5 pt-1">
                    <p className="font-bold text-gray-800">💡 الحقول المدعومة تلقائياً:</p>
                    <p className="font-mono break-all" dir="ltr">{WINDSOR_REVIEW_FIELDS}</p>
                    <p>يُحوّل وقت التقييم إلى توقيت السعودية. المزامنة تعمل كل 10 دقائق أثناء فتح التطبيق.</p>
                    <a className="text-purple-700 underline" href="https://windsor.ai/data-field/google_my_business/" target="_blank" rel="noreferrer">دليل حقول Windsor.ai</a>

                  </div>
                </div>
              </div>
            </div>
          )}

          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation (visible only on mobile: md:hidden) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 w-full bg-white/95 backdrop-blur-lg border-t border-slate-200 shadow-[0_-10px_30px_-10px_rgba(0,0,0,0.1)] z-50 px-2 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex overflow-x-auto gap-1 items-center custom-scrollbar">
        {navItems.map(item => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
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
