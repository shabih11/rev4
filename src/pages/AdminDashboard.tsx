import React, { useState, useCallback } from 'react';
import { CalendarClock, LogOut, Search, Plus, Activity, Users, Send, AlertOctagon, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { formatDateTime } from '../lib/formatDate';

export const AdminDashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const { users, branchSettings, updateBranchSettings, timeline, addTimelineComment, addTimelineEvent, updateTimelineEvent, updateReview } = useData();
  
  const [activeTab, setActiveTab] = useState<'shift' | 'timeline' | 'employees'>('shift');
  
  // Local branch employees
  const branchEmployees = users.filter(u => u.branch === user?.branch && u.role === 'employee');
  
  // Outsourced employees search
  const outsourcedEmployees = users.filter(u => u.branch === 'موظفة خارجية');
  const [searchQuery, setSearchQuery] = useState('');
  const [addedOutsourced, setAddedOutsourced] = useState<typeof users>([]);

  // Timeline for this branch
  const branchTimeline = timeline.filter(t => t.branch === user?.branch);
  const [commentInput, setCommentInput] = useState<Record<string, string>>({});
  const [unselectedEmpIds, setUnselectedEmpIds] = useState<string[]>([]);
  const [linkingReviewId, setLinkingReviewId] = useState<string | null>(null);
  const [linkingSelection, setLinkingSelection] = useState<string[]>([]);
  const [editingTimeId, setEditingTimeId] = useState<string | null>(null);
  const [editingTimeValue, setEditingTimeValue] = useState<string>('');
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }, []);
  
  const allAvailableEmployees = users.filter(u => (u.branch === user?.branch || u.branch === 'موظفة خارجية') && u.role === 'employee');

  const handleAddOutsourced = (emp: typeof users[0]) => {
    if (!addedOutsourced.find(e => e.id === emp.id)) {
      setAddedOutsourced([...addedOutsourced, emp]);
    }
    setSearchQuery('');
  };

  const handleStartShift = () => {
    const date = new Date().toLocaleDateString('en-GB').replace(/\//g, '-');
    
    const activeEmployees = [
      ...branchEmployees.filter(e => !unselectedEmpIds.includes(e.id)),
      ...addedOutsourced
    ].map(e => ({ id: e.id, name: e.name }));

    addTimelineEvent({
      branch: user?.branch || '',
      type: 'shift',
      title: 'تم بدء شفت جديد',
      time: currentBranchSettings.start,
      endTime: currentBranchSettings.end,
      date: date,
      employees: activeEmployees
    });
    showToast('تم بدء الشفت وتحديث الخط الزمني');
  };

  const handleAddComment = (id: string) => {
    if (commentInput[id]) {
      addTimelineComment(id, commentInput[id]);
      setCommentInput({ ...commentInput, [id]: '' });
    }
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

  const activeOutsourced = outsourcedEmployees.filter(emp => emp.name.includes(searchQuery));
  const currentBranchSettings = branchSettings[user?.branch || ''] || { start: '16:00', end: '00:00' };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-alexandria pb-20" dir="rtl">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] bg-green-600 text-white px-6 py-3 rounded-xl shadow-2xl flex items-center gap-2 animate-fade-in font-bold text-sm">
          <CheckCircle2 size={20} />
          {toast}
        </div>
      )}
      {/* Header */}
      <header className="bg-blue-600 text-white p-4 shadow-md flex justify-between items-center">
        <h1 className="text-xl font-bold">لوحة إدارة فرع {user?.branch}</h1>
        <button onClick={logout} className="p-2 hover:bg-blue-700 rounded-full flex items-center gap-2">
          تسجيل الخروج
          <LogOut size={20} />
        </button>
      </header>

      {/* Main Content */}
      <div className="flex-1 p-4 max-w-7xl mx-auto w-full">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 overflow-x-auto min-h-[75vh]">
          
          {activeTab === 'shift' && (
            <div>
              <div className="flex items-center gap-3 mb-6 border-b pb-4">
                <CalendarClock className="text-blue-600" size={28} />
                <h2 className="text-2xl font-bold text-gray-800">إدارة الشفت الحالي</h2>
              </div>
              
              <p className="text-gray-500 mb-8">حددي الموظفات المتواجدات حالياً في الفرع لربط التقييمات بهن.</p>

              <div className="mb-8">
                <h3 className="font-bold text-lg mb-4 text-gray-700">موظفات الفرع</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {branchEmployees.map((emp) => (
                    <label key={emp.id} className="flex items-center space-x-3 space-x-reverse p-4 bg-gray-50 rounded-xl border border-gray-200 cursor-pointer hover:bg-blue-50 transition-colors">
                      <input 
                        type="checkbox" 
                        checked={!unselectedEmpIds.includes(emp.id)} 
                        onChange={(e) => {
                          if (e.target.checked) {
                            setUnselectedEmpIds(prev => prev.filter(id => id !== emp.id));
                          } else {
                            setUnselectedEmpIds(prev => [...prev, emp.id]);
                          }
                        }}
                        className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500" 
                      />
                      <span className="font-bold text-gray-800">{emp.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="mb-8 p-6 bg-blue-50 rounded-xl border border-blue-100">
                <h3 className="font-bold text-lg mb-2 text-blue-900">موظفات المصدر الخارجي</h3>
                <p className="text-sm text-blue-700 mb-4">ابحثي عن موظفة خارجية لضمها لشفت الفرع اليوم</p>
                
                <div className="relative mb-4">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                  <input 
                    type="text" 
                    placeholder="بحث بالاسم..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full p-3 pr-10 border rounded-lg"
                  />
                  
                  {searchQuery && (
                    <div className="absolute top-full right-0 w-full bg-white shadow-xl rounded-lg mt-1 border z-10">
                      {activeOutsourced.length > 0 ? activeOutsourced.map(emp => (
                        <button 
                          key={emp.id}
                          onClick={() => handleAddOutsourced(emp)}
                          className="w-full text-right p-3 hover:bg-blue-50 border-b flex justify-between items-center"
                        >
                          <span className="font-bold">{emp.name}</span>
                          <Plus size={18} className="text-blue-600" />
                        </button>
                      )) : (
                        <div className="p-3 text-gray-500 text-sm">لا توجد نتائج</div>
                      )}
                    </div>
                  )}
                </div>

                {addedOutsourced.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-4">
                    {addedOutsourced.map(emp => (
                      <div key={emp.id} className="bg-white border border-blue-200 px-4 py-2 rounded-full text-sm font-bold text-blue-800 flex items-center gap-2">
                        {emp.name}
                        <button onClick={() => setAddedOutsourced(addedOutsourced.filter(e => e.id !== emp.id))} className="text-red-400 hover:text-red-600">×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t pt-6">
                <div className="flex gap-4 mb-6">
                  <div className="flex-1">
                    <label className="block text-sm font-bold text-gray-700 mb-2">وقت البدء (الافتراضي)</label>
                    <input 
                      type="time" 
                      value={currentBranchSettings.start} 
                      onChange={(e) => updateBranchSettings(user?.branch || '', e.target.value, currentBranchSettings.end, currentBranchSettings.googleApi, currentBranchSettings.nextDayTime)}
                      className="w-full p-3 border rounded-lg bg-gray-50 focus:ring-2 focus:ring-blue-500" 
                    />
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-end mb-2">
                      <label className="block text-sm font-bold text-gray-700">وقت الانتهاء</label>
                      <button 
                        onClick={() => updateBranchSettings(user?.branch || '', currentBranchSettings.start, currentBranchSettings.nextDayTime || '10:00', currentBranchSettings.googleApi, currentBranchSettings.nextDayTime)}
                        className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded font-bold hover:bg-indigo-200"
                      >
                        حتى بدء اليوم التالي
                      </button>
                    </div>
                    <input 
                      type="time" 
                      value={currentBranchSettings.end} 
                      onChange={(e) => updateBranchSettings(user?.branch || '', currentBranchSettings.start, e.target.value, currentBranchSettings.googleApi, currentBranchSettings.nextDayTime)}
                      className="w-full p-3 border rounded-lg bg-gray-50 focus:ring-2 focus:ring-blue-500" 
                    />
                  </div>
                </div>

                <button 
                  onClick={handleStartShift}
                  className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-4 rounded-xl text-lg shadow-lg hover:scale-[1.02] transition-transform flex items-center justify-center gap-2"
                >
                  <CalendarClock size={24} />
                  بدء الشفت وتسجيل الوقت
                </button>
              </div>
            </div>
          )}

          {activeTab === 'timeline' && (
            <div>
              <div className="flex items-center gap-3 mb-6 border-b pb-4">
                <Activity className="text-blue-600" size={28} />
                <h2 className="text-2xl font-bold text-gray-800">الخط الزمني</h2>
              </div>
              <p className="text-gray-500 mb-6">يظهر هنا تسلسل الشفتات والفترات غير المغطاة (الثغرات).</p>

              <div className="space-y-4 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-300 before:to-transparent">
                {branchTimeline.map((item) => (
                  <div key={item.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                    <div className={`flex items-center justify-center w-10 h-10 rounded-full border-4 border-white shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-sm ${item.type === 'gap' ? 'bg-red-500' : item.type === 'review' ? 'bg-yellow-500' : 'bg-green-500'}`}>
                      {item.type === 'gap' ? <AlertOctagon size={16} className="text-white" /> : item.type === 'review' ? <span className="text-white text-xs font-bold">★</span> : <CalendarClock size={16} className="text-white" />}
                    </div>
                    <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-white p-4 rounded-xl border shadow-sm">
                      <div className="flex items-center justify-between mb-1">
                        <h4 className={`font-bold ${item.type === 'gap' ? 'text-red-600' : 'text-green-600'}`}>{item.title}</h4>
                        <time className="text-xs font-medium text-gray-500">
                          {item.date ? formatDateTime(item.date, item.time) : item.time}
                          {item.endTime && ` - ${item.endTime}`}
                        </time>
                      </div>
                      
                      {item.type === 'gap' && (
                        <div className="mt-3 border-t pt-3">
                          {item.comment ? (
                            <p className="text-sm bg-gray-50 p-2 rounded text-gray-700 italic border-r-2 border-red-500">
                              {item.title.includes('اعتراض') ? 'الاعتراض: ' : 'تعليق المديرة: '} {item.comment}
                            </p>
                          ) : (
                            <div className="flex gap-2">
                              <input 
                                type="text"
                                placeholder="اكتبي تعليق للإدارة (سبب النقص)..."
                                value={commentInput[item.id] || ''}
                                onChange={(e) => setCommentInput({ ...commentInput, [item.id]: e.target.value })}
                                className="flex-1 text-sm p-2 border rounded"
                              />
                              <button onClick={() => handleAddComment(item.id)} className="bg-blue-600 text-white p-2 rounded hover:bg-blue-700">
                                <Send size={16} />
                              </button>
                            </div>
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
                            <div className="mt-2 space-y-2">
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
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {branchTimeline.length === 0 && <p className="text-center text-gray-500 py-10">لا يوجد أحداث في الخط الزمني بعد.</p>}
              </div>
            </div>
          )}

          {activeTab === 'employees' && (
            <div>
              <div className="flex items-center gap-3 mb-6 border-b pb-4">
                <Users className="text-blue-600" size={28} />
                <h2 className="text-2xl font-bold text-gray-800">موظفات الفرع</h2>
              </div>
              <p className="text-gray-500 mb-6">قائمة الموظفات المسجلات في فرعك (للعرض فقط).</p>
              
              <div className="grid gap-4">
                {branchEmployees.map(emp => (
                  <div key={emp.id} className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl border">
                    <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-gray-200 bg-white shrink-0">
                      <img src={emp.imageUrl} alt={emp.name} className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-gray-800 text-lg">{emp.name}</p>
                      <p className="text-sm text-gray-500">إيجابي: <span className="text-green-600 font-bold">{emp.stats.positive}</span> | سلبي: <span className="text-red-600 font-bold">{emp.stats.negative}</span></p>
                    </div>
                    <div className="text-left">
                      <p className="text-2xl font-extrabold text-blue-600">{emp.points}</p>
                      <p className="text-xs text-gray-400">نقاط</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 w-full bg-white/90 backdrop-blur-lg border-t border-gray-200 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)] z-50 px-2 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex justify-around items-center">
        <button 
          onClick={() => setActiveTab('shift')}
          className={`flex-1 flex flex-col items-center justify-center gap-1.5 py-2 rounded-xl transition-all duration-300 ${activeTab === 'shift' ? 'text-blue-600 bg-blue-50/80 scale-105' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'}`}
        >
          <CalendarClock size={22} className={activeTab === 'shift' ? 'stroke-[2.5px]' : ''} />
          <span className="text-[10px] font-bold">الشفت</span>
        </button>
        <button 
          onClick={() => setActiveTab('timeline')}
          className={`flex-1 flex flex-col items-center justify-center gap-1.5 py-2 rounded-xl transition-all duration-300 ${activeTab === 'timeline' ? 'text-blue-600 bg-blue-50/80 scale-105' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'}`}
        >
          <Activity size={22} className={activeTab === 'timeline' ? 'stroke-[2.5px]' : ''} />
          <span className="text-[10px] font-bold">الخط الزمني</span>
        </button>
        <button 
          onClick={() => setActiveTab('employees')}
          className={`flex-1 flex flex-col items-center justify-center gap-1.5 py-2 rounded-xl transition-all duration-300 ${activeTab === 'employees' ? 'text-blue-600 bg-blue-50/80 scale-105' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'}`}
        >
          <Users size={22} className={activeTab === 'employees' ? 'stroke-[2.5px]' : ''} />
          <span className="text-[10px] font-bold">موظفات الفرع</span>
        </button>
      </div>
    </div>
  );
};
