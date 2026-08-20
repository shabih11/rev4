import React, { useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { AlertOctagon, Users, LogOut, Building2, Activity, CalendarClock, MessageSquareWarning, Upload, ShieldAlert, PlusCircle, CheckCircle2, BarChart3, Trash2, Edit, Undo2, History, Zap, Copy, Check, RefreshCw, Globe, Link } from 'lucide-react';
import employeeImg from '../assets/employee.png';
import { formatDateTime, toEnglishNumerals } from '../lib/formatDate';

export const SystemAdminDashboard: React.FC = () => {
  const { logout } = useAuth();
  const { users, updateUser, addUser, removeUser, branchSettings, updateBranchSettings, timeline, addTimelineEvent, updateTimelineEvent, deleteTimelineEvent, reviews, parseReviewsText, commitReviews, commitShifts, updateReview, deleteReview, undoBatch, clearData, makeWebhookUrl, setMakeWebhookUrl, makeAutoSync, setMakeAutoSync, fetchAndProcessMakeReviews } = useData();
  const [activeTab, setActiveTab] = useState<'timeline' | 'branches' | 'employees' | 'notes' | 'stats' | 'history' | 'shifts' | 'make' | 'danger'>('timeline');
  
  const [tempMakeUrl, setTempMakeUrl] = useState(makeWebhookUrl);
  const [isFetchingMake, setIsFetchingMake] = useState(false);
  const [makeStatusMsg, setMakeStatusMsg] = useState<{ text: string, type: 'success' | 'error' | 'info' } | null>(null);
  const [copiedSchema, setCopiedSchema] = useState(false);

  const branches = ['جاليري', 'ذافيو', 'سلام', 'القصر', 'المملكة', 'شرق'];
  const [selectedBranch, setSelectedBranch] = useState(branches[0]);
  const [selectedTimelineBranch, setSelectedTimelineBranch] = useState(branches[0]);
  
  const branchEmployees = users.filter(u => (selectedBranch === 'موظفة خارجية' ? u.branch === 'موظفة خارجية' : u.branch === selectedBranch) && u.role === 'employee');
  const filteredTimeline = timeline.filter(t => t.branch === selectedTimelineBranch);
  
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
  const allAvailableEmployees = users.filter(u => (u.branch === selectedTimelineBranch || u.branch === 'موظفة خارجية') && u.role === 'employee');

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
          const foundEmp = users.find(u => (u.branch === selectedBranch || u.branch === 'موظفة خارجية') && (u.name === name || u.id === name || u.name === `الموظفة ${name}`));
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
    const branch = selectedBranch === 'موظفة خارجية' ? 'موظفة خارجية' : selectedBranch;
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
    <div className="min-h-screen bg-gray-50 flex flex-col font-alexandria pb-20" dir="rtl">
      {/* Hidden File Input */}
      <input type="file" ref={fileInputRef} className="hidden" accept="image/png,image/jpeg,image/webp,image/*" onChange={handleFileUpload} />

      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] bg-green-600 text-white px-6 py-3 rounded-xl shadow-2xl flex items-center gap-2 animate-fade-in font-bold text-sm">
          <CheckCircle2 size={20} />
          {toast}
        </div>
      )}

      {/* Header */}
      <header className="bg-gray-800 text-white p-4 shadow-md flex justify-between items-center">
        <h1 className="text-2xl font-bold">لوحة الإدارة العامة</h1>
        <button onClick={logout} className="p-2 hover:bg-gray-700 rounded-full flex items-center gap-2">
          تسجيل الخروج
          <LogOut size={20} />
        </button>
      </header>

      {/* Main Content */}
      <div className="flex-1 p-4 max-w-7xl mx-auto w-full">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 overflow-x-auto min-h-[75vh]">
          
          {activeTab === 'timeline' && (
            <div>
              <h2 className="text-xl font-bold mb-4 border-b pb-2">الخط الزمني لشفتات الفروع</h2>
              
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
                            {item.date ? formatDateTime(item.date, item.time) : item.time}
                            {item.endTime && ` - ${item.endTime}`}
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
                {branches.map(branch => {
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
                                    <span className="text-green-600 font-bold">{emp.stats.positive}</span> إيجابي | <span className="text-red-600 font-bold">{emp.stats.negative}</span> سلبي
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
              <div className="flex justify-between items-center mb-4 border-b pb-2">
                <h2 className="text-xl font-bold">إدارة الموظفات</h2>
                <button onClick={() => setShowAddForm(!showAddForm)} className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 text-sm font-bold flex gap-2 items-center">
                  <PlusCircle size={16} /> إضافة موظفة
                </button>
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

              <h3 className="font-bold text-lg mb-4 text-gray-800">
                {selectedBranch === 'موظفة خارجية' ? 'الموظفات الخارجيات' : `موظفات فرع ${selectedBranch}`} ({branchEmployees.length})
              </h3>

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
                {timeline.filter(t => t.title.includes('شكوى') || t.title.includes('سلامة') || t.title.includes('مخالفة')).slice(0, 10).map(t => (
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
                            <p className="text-xs text-gray-400 mt-2">{t.time} • {t.branch}</p>
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
                  <select value={selectedBranch} onChange={e => setSelectedBranch(e.target.value)} className="w-full p-3 border border-blue-200 rounded-lg">
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
                        const template = `وقت البداية: ١٦:٠٠ ٠٢-٠٣-٢٠٢٦\nوقت النهاية: ١١:٥٩ ٠٣-٠٣-٢٠٢٦\nالموظفات: (رانيا)(نورة)`;
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
                              <div className="font-bold text-sm text-gray-800">شفت ({s.time} - {s.endTime})</div>
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
                  {injectionBatches.map(batch => (
                    <div key={batch.id} className="flex justify-between items-center p-4 bg-white rounded-xl border border-gray-200 shadow-sm">
                      <div>
                        <div className="font-bold text-gray-800 flex items-center gap-2">
                          {batch.type === 'review' ? <span className="text-yellow-600">★ تقييمات</span> : <span className="text-indigo-600">⏱ شفتات</span>}
                          - فرع {batch.branch}
                        </div>
                        <div className="text-sm text-gray-500 mt-1">
                          تاريخ العملية: {new Date(batch.time).toLocaleString('ar-SA')}
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
                <select value={selectedTimelineBranch} onChange={e => setSelectedTimelineBranch(e.target.value)} className="p-2 border border-indigo-200 rounded-lg bg-indigo-50 font-bold text-indigo-800">
                  {branches.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div className="space-y-4">
                {timeline.filter(t => t.branch === selectedTimelineBranch && t.type === 'shift').map(s => {
                  const linkedReviewsCount = reviews.filter(r => r.linkedShiftId === s.id || (r.branch === s.branch && r.time >= s.time && (s.endTime ? r.time <= s.endTime : true) && r.linkedShiftId === undefined)).length;
                  return (
                    <div key={s.id} className="bg-white p-4 rounded-xl border border-indigo-100 shadow-sm flex flex-col md:flex-row justify-between md:items-center gap-4">
                      <div>
                        <div className="font-bold text-gray-800 text-lg flex items-center gap-2">
                          ⏱ شفت ({s.time} - {s.endTime || 'نهاية اليوم'})
                          {s.date && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">{s.date}</span>}
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
                      if (confirm(`هل أنت متأكد من حذف البيانات للفترة ${start} إلى ${end} لـ ${branch === 'all' ? 'جميع الفروع' : branch}؟`)) {
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

          {/* Make.com Integration Tab */}
          {activeTab === 'make' && (
            <div className="space-y-6">
              {/* Header Banner */}
              <div className="bg-gradient-to-r from-purple-700 via-indigo-700 to-blue-700 text-white p-6 rounded-2xl shadow-lg relative overflow-hidden">
                <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div>
                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-xs font-bold mb-2">
                      <Zap size={14} className="text-yellow-300 fill-yellow-300" />
                      تكامل سيناريوهات Make.com
                    </div>
                    <h2 className="text-2xl font-black">جلب واستدعاء التقييمات الآلي من Make.com</h2>
                    <p className="text-purple-100 text-sm mt-1 max-w-2xl">
                      ربط النظام بشرائح وتطبيقات Make.com (خرائط جوجل، واتساب، نماذج التقييم) لجلب التقييمات وتوزيعها آلياً على شفتات الموظفين.
                    </p>
                  </div>

                  <button
                    onClick={async () => {
                      setIsFetchingMake(true);
                      setMakeStatusMsg(null);
                      const res = await fetchAndProcessMakeReviews(tempMakeUrl);
                      setIsFetchingMake(false);
                      if (res.success) {
                        setMakeStatusMsg({ text: res.count > 0 ? `تم جلب وحقن ${res.count} تقييمات جديدة بنجاح!` : 'لا توجد تقييمات جديدة في سيناريو Make.com', type: 'success' });
                      } else {
                        setMakeStatusMsg({ text: res.error || 'حدث خطأ أثناء الجلب', type: 'error' });
                      }
                    }}
                    disabled={isFetchingMake}
                    className="bg-amber-400 hover:bg-amber-300 text-gray-900 font-extrabold px-6 py-3.5 rounded-xl shadow-md transition duration-200 flex items-center gap-2 disabled:opacity-50 shrink-0 cursor-pointer"
                  >
                    <RefreshCw size={20} className={isFetchingMake ? 'animate-spin' : ''} />
                    {isFetchingMake ? 'جاري الاستدعاء...' : 'جلب التقييمات من Make.com الآن'}
                  </button>
                </div>
              </div>

              {/* Status Message Alert */}
              {makeStatusMsg && (
                <div className={`p-4 rounded-xl font-bold flex items-center justify-between shadow-sm ${makeStatusMsg.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                  <div className="flex items-center gap-2">
                    {makeStatusMsg.type === 'success' ? <CheckCircle2 size={20} className="text-emerald-600" /> : <AlertOctagon size={20} className="text-red-600" />}
                    <span>{makeStatusMsg.text}</span>
                  </div>
                  <button onClick={() => setMakeStatusMsg(null)} className="text-xs opacity-60 hover:opacity-100">إغلاق</button>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Webhook Settings Card */}
                <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-5">
                  <div className="flex items-center gap-3 border-b border-gray-100 pb-4">
                    <div className="p-3 bg-purple-50 text-purple-600 rounded-xl">
                      <Link size={24} />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 text-lg">إعدادات رابط Make.com Webhook</h3>
                      <p className="text-xs text-gray-500">أدخل رابط Custom Webhook الذي يخرج التقييمات بصيغة JSON</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="block text-xs font-bold text-gray-700">رابط Webhook / Response URL:</label>
                    <div className="flex gap-2">
                      <input
                        type="url"
                        placeholder="https://hook.eu1.make.com/xxxxxxxxxxxxxxxxxxxx"
                        value={tempMakeUrl}
                        onChange={(e) => setTempMakeUrl(e.target.value)}
                        className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm font-mono focus:bg-white focus:ring-2 focus:ring-purple-500 focus:outline-none"
                      />
                      <button
                        onClick={() => {
                          setMakeWebhookUrl(tempMakeUrl);
                          showToast('تم حفظ رابط Make.com بنجاح');
                        }}
                        className="bg-purple-600 hover:bg-purple-700 text-white font-bold px-5 py-2.5 rounded-xl shadow-sm transition"
                      >
                        حفظ الرابط
                      </button>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-gray-900">المزامنة التلقائية (Auto-Sync Interval)</h4>
                      <p className="text-xs text-gray-500">التحقق التلقائي واستدعاء التقييمات كل 10 دقائق</p>
                    </div>
                    <button
                      onClick={() => {
                        const newVal = !makeAutoSync;
                        setMakeAutoSync(newVal);
                        showToast(newVal ? 'تم تفعيل المزامنة الآلية مع Make.com' : 'تم إيقاف المزامنة الآلية');
                      }}
                      className={`relative inline-flex h-7 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${makeAutoSync ? 'bg-emerald-500' : 'bg-gray-300'}`}
                    >
                      <span className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${makeAutoSync ? '-translate-x-7' : 'translate-x-0'}`} />
                    </button>
                  </div>
                </div>

                {/* Make.com Payload Guidelines */}
                <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
                  <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
                        <Globe size={24} />
                      </div>
                      <div>
                        <h3 className="font-bold text-gray-900 text-lg">صيغة البيانات (Make JSON Schema)</h3>
                        <p className="text-xs text-gray-500">استخدم هذه الهيكلية في وحدة Webhook Response بمنصة Make</p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        const schemaText = `[\n  {\n    "reviewerName": "سارة أحمد",\n    "rating": 5,\n    "comment": "خدمة ممتازة وسريعة",\n    "date": "${new Date().getDate().toString().padStart(2, '0')}-${(new Date().getMonth() + 1).toString().padStart(2, '0')}-${new Date().getFullYear()}",\n    "time": "18:30",\n    "branch": "جاليري"\n  }\n]`;
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
                    <pre>{`[
  {
    "reviewerName": "سارة أحمد",
    "rating": 5,
    "comment": "خدمة ممتازة وسريعة",
    "date": "20-08-2026",
    "time": "18:30",
    "branch": "جاليري"
  }
]`}</pre>
                  </div>

                  <div className="text-xs text-gray-600 space-y-1.5 pt-1">
                    <p className="font-bold text-gray-800">💡 الحقول المدعومة تلقائياً:</p>
                    <ul className="list-disc list-inside space-y-1 text-gray-500">
                      <li><code className="bg-gray-100 px-1 py-0.5 rounded text-purple-700">reviewerName</code> أو <code className="bg-gray-100 px-1 py-0.5 rounded text-purple-700">name</code>: اسم صاحب التقييم.</li>
                      <li><code className="bg-gray-100 px-1 py-0.5 rounded text-purple-700">rating</code> أو <code className="bg-gray-100 px-1 py-0.5 rounded text-purple-700">stars</code>: تقييم التنجيم (1 إلى 5).</li>
                      <li><code className="bg-gray-100 px-1 py-0.5 rounded text-purple-700">comment</code> أو <code className="bg-gray-100 px-1 py-0.5 rounded text-purple-700">text</code>: نص التعليق.</li>
                      <li><code className="bg-gray-100 px-1 py-0.5 rounded text-purple-700">date</code> و <code className="bg-gray-100 px-1 py-0.5 rounded text-purple-700">time</code>: تاريخ ووقت التقييم (سيتم الربط التلقائي بشفت الفرع).</li>
                      <li><code className="bg-gray-100 px-1 py-0.5 rounded text-purple-700">branch</code>: اسم الفرع (جاليري، ذافيو، سلام، القصر، المملكة، شرق).</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 w-full bg-white/90 backdrop-blur-lg border-t border-gray-200 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)] z-50 px-2 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex overflow-x-auto gap-2 items-center custom-scrollbar">
        <button onClick={() => setActiveTab('timeline')}
          className={`shrink-0 min-w-[70px] flex-1 flex flex-col items-center justify-center gap-1.5 py-2 rounded-xl transition-all duration-300 ${activeTab === 'timeline' ? 'text-blue-600 bg-blue-50/80 scale-105' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'}`}>
          <Activity size={22} className={activeTab === 'timeline' ? 'stroke-[2.5px]' : ''} />
          <span className="text-[10px] font-bold">الخط الزمني</span>
        </button>
        <button onClick={() => setActiveTab('shifts')}
          className={`shrink-0 min-w-[70px] flex-1 flex flex-col items-center justify-center gap-1.5 py-2 rounded-xl transition-all duration-300 ${activeTab === 'shifts' ? 'text-indigo-600 bg-indigo-50/80 scale-105' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'}`}>
          <CalendarClock size={22} className={activeTab === 'shifts' ? 'stroke-[2.5px]' : ''} />
          <span className="text-[10px] font-bold">الشفتات</span>
        </button>
        <button onClick={() => setActiveTab('branches')}
          className={`shrink-0 min-w-[70px] flex-1 flex flex-col items-center justify-center gap-1.5 py-2 rounded-xl transition-all duration-300 ${activeTab === 'branches' ? 'text-blue-600 bg-blue-50/80 scale-105' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'}`}>
          <Building2 size={22} className={activeTab === 'branches' ? 'stroke-[2.5px]' : ''} />
          <span className="text-[10px] font-bold">الفروع</span>
        </button>
        <button onClick={() => setActiveTab('employees')}
          className={`shrink-0 min-w-[70px] flex-1 flex flex-col items-center justify-center gap-1.5 py-2 rounded-xl transition-all duration-300 ${activeTab === 'employees' ? 'text-blue-600 bg-blue-50/80 scale-105' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'}`}>
          <Users size={22} className={activeTab === 'employees' ? 'stroke-[2.5px]' : ''} />
          <span className="text-[10px] font-bold">الموظفات</span>
        </button>
        <button onClick={() => setActiveTab('notes')}
          className={`shrink-0 min-w-[70px] flex-1 flex flex-col items-center justify-center gap-1.5 py-2 rounded-xl transition-all duration-300 ${activeTab === 'notes' ? 'text-blue-600 bg-blue-50/80 scale-105' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'}`}>
          <MessageSquareWarning size={22} className={activeTab === 'notes' ? 'stroke-[2.5px]' : ''} />
          <span className="text-[10px] font-bold">الملاحظات</span>
        </button>
        <button onClick={() => setActiveTab('stats')}
          className={`shrink-0 min-w-[70px] flex-1 flex flex-col items-center justify-center gap-1.5 py-2 rounded-xl transition-all duration-300 ${activeTab === 'stats' ? 'text-blue-600 bg-blue-50/80 scale-105' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'}`}>
          <BarChart3 size={22} className={activeTab === 'stats' ? 'stroke-[2.5px]' : ''} />
          <span className="text-[10px] font-bold">التقييمات</span>
        </button>
        <button onClick={() => setActiveTab('history')}
          className={`shrink-0 min-w-[70px] flex-1 flex flex-col items-center justify-center gap-1.5 py-2 rounded-xl transition-all duration-300 ${activeTab === 'history' ? 'text-blue-600 bg-blue-50/80 scale-105' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'}`}>
          <History size={22} className={activeTab === 'history' ? 'stroke-[2.5px]' : ''} />
          <span className="text-[10px] font-bold">السجل</span>
        </button>
        <button onClick={() => setActiveTab('make')}
          className={`shrink-0 min-w-[70px] flex-1 flex flex-col items-center justify-center gap-1.5 py-2 rounded-xl transition-all duration-300 ${activeTab === 'make' ? 'text-purple-600 bg-purple-50/80 scale-105' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'}`}>
          <Zap size={22} className={activeTab === 'make' ? 'stroke-[2.5px] text-amber-500 fill-amber-400' : ''} />
          <span className="text-[10px] font-bold">Make.com</span>
        </button>
        <button onClick={() => setActiveTab('danger')}
          className={`shrink-0 min-w-[70px] flex-1 flex flex-col items-center justify-center gap-1.5 py-2 rounded-xl transition-all duration-300 ${activeTab === 'danger' ? 'text-red-600 bg-red-50/80 scale-105' : 'text-red-400 hover:text-red-600 hover:bg-red-50'}`}>
          <ShieldAlert size={22} className={activeTab === 'danger' ? 'stroke-[2.5px]' : ''} />
          <span className="text-[10px] font-bold">منطقة الخطر</span>
        </button>
      </div>
    </div>
  );
};
