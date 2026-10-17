import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ActivityChart } from './ActivityChart';
import { favoritePartner, newestFirst } from '../lib/employeeActivity';
import type { UserAccount } from '../lib/mockData';
import { X, CalendarClock, Star, Clock, Award } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useData } from '../context/DataContext';
import type { TimelineEvent } from '../context/DataContext';
import { formatDateTime, toEnglishNumerals, formatDate, formatTime, shiftName } from '../lib/formatDate';

interface Props {
  employee: UserAccount;
  children: React.ReactNode;
  onModalOpen?: () => void;
  onModalClose?: () => void;
}

export const EmployeeCard: React.FC<Props> = ({ employee, children, onModalOpen, onModalClose }) => {
  const [showModal, setShowModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'reviews' | 'shifts' | 'activity' | 'points'>('activity');
  const { reviews, reviewSummaries, users, timeline, currentAccount, recordsReady, syncError } = useData();
  const privateReviews = new Map(reviews.map(review => [review.id, review]));
  const employeeReviews = reviewSummaries
    .filter(review => review.linkedEmployeeIds.includes(employee.id) || review.linkedEmployeeIds.includes(employee.name))
    .map(review => ({ ...review, comment: privateReviews.get(review.id)?.comment })).sort(newestFirst);
  const canReadAllShifts = currentAccount?.role === 'admin' || currentAccount?.id === employee.id ||
    (currentAccount?.role === 'manager' && currentAccount.branch === employee.branch);
  const [selectedShift, setSelectedShift] = useState<TimelineEvent | null>(null);
  const isEmpMatch = (id?: string, name?: string) => {
    if (!id && !name) return false;
    if (id === employee.id || name === employee.name) return true;
    if (employee.aliases && name && employee.aliases.includes(name)) return true;
    return false;
  };
  const employeeShifts = timeline.filter(t => t.type === 'shift' && t.employees?.some(e => isEmpMatch(e.id, e.name))).sort(newestFirst);

  const partner = favoritePartner(employee.id, reviewSummaries);
  const favoritePartnerName = users.find(user => user.id === partner.id)?.name || '';

  useEffect(() => {
    if (showModal) {
      onModalOpen?.();
    } else {
      onModalClose?.();
    }
  }, [showModal]);

  let totalHours = 0;
  employeeShifts.forEach(s => {
    if (s.time && s.endTime) {
      const [sh, sm] = s.time.split(':').map(Number);
      const [eh, em] = s.endTime.split(':').map(Number);
      let diff = (eh + em/60) - (sh + sm/60);
      if (diff < 0) diff += 24;
      totalHours += diff;
    } else {
      totalHours += 8;
    }
  });
  totalHours = Math.round(totalHours);

  return (
    <>
      <div onClick={event => { event.stopPropagation(); setShowModal(true); }}>
        {children}
      </div>

      {createPortal(<AnimatePresence>
        {showModal && (
          <div 
            className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4 font-alexandria touch-auto"
            dir="rtl" role="dialog" aria-modal="true" aria-label={`بيانات ${employee.name}`}
            onClick={event => event.stopPropagation()}
          >
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowModal(false)}
            />
            
            {/* Modal */}
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="relative w-full max-w-2xl min-w-0 bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
                <div className="bg-blue-600 p-4 sm:p-6 text-white flex justify-between items-center sticky top-0 z-10">
                  <div className="flex items-center gap-4">
                    <img src={employee.imageUrl} alt={employee.name} className="w-16 h-16 rounded-full object-cover object-top border-2 border-white/50 shadow-md shrink-0 bg-blue-200" />
                    <div>
                      <h3 className="text-xl sm:text-2xl font-bold">{employee.name}</h3>
                      <p className="text-blue-100 text-sm mb-1">{employee.branch}</p>
                      <div className="flex gap-2 mt-1 flex-wrap">
                        <button onClick={() => setActiveTab('points')} aria-label="عرض تفاصيل النقاط" className="text-[10px] sm:text-xs bg-blue-500/50 hover:bg-blue-500 px-2 py-1 rounded-md">النقاط: {employee.points != null ? employee.points.toFixed(1) : '0.0'}</button>
                        <p className="text-[10px] sm:text-xs bg-blue-500/50 px-2 py-1 rounded-md">إجمالي التقييمات: {employee.reviewsCount ?? 0}</p>
                      </div>
                      {favoritePartnerName && (
                        <p className="text-[10px] sm:text-xs text-blue-100 mt-2 font-medium bg-blue-800/40 w-fit px-2 py-1 rounded-full">
                          شريكتي المفضلة: {favoritePartnerName}
                        </p>
                      )}
                    </div>
                  </div>
                <button 
                  onClick={(e) => { e.stopPropagation(); setShowModal(false); }}
                  className="p-2 bg-blue-500/50 hover:bg-blue-500 rounded-full transition-colors self-start shrink-0"
                >
                  <X size={24} />
                </button>
              </div>

              {/* Tabs */}
              <div className="flex border-b">
                <button 
                  onClick={() => setActiveTab('reviews')}
                  className={`flex-1 p-3 font-bold flex items-center justify-center gap-2 transition-colors ${activeTab === 'reviews' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500'}`}
                >
                  <Star size={18} />
                  تقييماتي
                </button>
                <button 
                  onClick={() => setActiveTab('shifts')}
                  className={`flex-1 p-3 font-bold flex items-center justify-center gap-2 transition-colors ${activeTab === 'shifts' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500'}`}
                >
                  <CalendarClock size={18} />
                  شفتاتي
                </button>
                <button 
                  onClick={() => setActiveTab('activity')}
                  className={`flex-1 p-3 font-bold flex items-center justify-center gap-2 transition-colors ${activeTab === 'activity' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500'}`}
                >
                  <Award size={18} />
                  نشاطي
                </button>
              </div>

              {/* Body */}
              <div className="p-4 sm:p-6 bg-gray-50 h-[50vh] overflow-y-auto">
                {syncError ? <p role="alert" className="text-red-700 text-center">{syncError}</p> : !recordsReady && <p role="status" className="text-center text-gray-500">جارٍ تحميل السجلات…</p>}
                {activeTab === 'reviews' ? (
                  <div className="space-y-4 pt-2 pb-2">
                    {employeeReviews.map(r => {
                      const linkedNames = r.linkedEmployeeIds.map((id: string) => users.find((u: any) => u.id === id)?.name || id).join('، ');
                      return (
                      <div key={r.id} className="bg-white p-4 rounded-xl border shadow-sm relative">
                        {linkedNames && (
                          <div className="absolute -top-2.5 right-4 bg-white border border-gray-100 px-2 py-0.5 rounded text-[10px] text-gray-400 font-medium shadow-sm z-10">
                            {linkedNames}
                          </div>
                        )}
                        <div className="flex justify-between items-start">
                          <div className="flex text-yellow-400 mb-2">{'★'.repeat(Math.min(5, Math.max(0, parseInt(toEnglishNumerals(r.rating), 10) || 0)))}{'☆'.repeat(5 - Math.min(5, Math.max(0, parseInt(toEnglishNumerals(r.rating), 10) || 0)))}</div>
                          <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-1 rounded">
                            {formatDateTime(r.date, r.time)}
                          </span>
                        </div>
                        {r.comment !== undefined ? <p className="text-gray-700 text-sm">{r.comment || 'تقييم بدون تعليق'}</p> : <p className="text-xs text-gray-500">تقييم {r.rating} نجوم في فرع {r.branch}، مرتبط بـ {r.linkedEmployeeIds.length} من الموظفات.</p>}
                        {employee.branch === 'موظفة خارجية' && (
                          <p className="text-xs text-blue-600 mt-2 font-bold">الفرع: {r.branch}</p>
                        )}
                      </div>
                      );
                    })}
                    {employeeReviews.length === 0 && recordsReady && !syncError && (
                      <p className="text-center text-gray-500 py-10">لا توجد تقييمات مكتسبة بعد.</p>
                    )}
                  </div>
                ) : activeTab === 'shifts' ? (
                  <div className="space-y-3">
                    {/* Total Hours Badge */}
                    {canReadAllShifts && <div className="bg-transparent border border-gray-200 text-gray-700 p-2 rounded-xl flex items-center justify-center gap-2 shadow-sm mb-4">
                      <Clock size={18} className="text-blue-600" />
                      <p className="font-bold text-sm">{totalHours} ساعات في صناعة تجربة العميل</p>
                    </div>}


                    {employeeShifts.length > 0 ? employeeShifts.map((shift, idx) => {
                      return (
                        <div key={shift.id || idx} onClick={() => setSelectedShift(shift)} className="bg-white p-4 rounded-xl border shadow-sm flex flex-col relative cursor-pointer hover:bg-gray-50 transition-colors">
                          <p className="font-bold text-gray-800">{formatDate(shift.date)} <span className="text-xs font-medium text-gray-500">({shiftName(shift.time)})</span></p>
                          <p className="text-xs text-gray-400 mt-1">{shift.employees?.filter(e => !isEmpMatch(e.id, e.name)).length ? `مع ${shift.employees.filter(e => !isEmpMatch(e.id, e.name)).map(e => e.name).join(' و')}` : 'بدون شريكة'}</p>
                        </div>
                      );
                    }) : (
                      recordsReady && !syncError && <p className="text-center text-gray-500 py-10">{canReadAllShifts ? 'لا توجد شفتات مسجلة.' : 'لا توجد شفتات مشتركة متاحة لحسابك.'}</p>
                    )}
                  </div>
                ) : activeTab === 'activity' ? (
                  <ActivityChart reviews={employeeReviews} />
                ) : activeTab === 'points' ? (
                  <div className="space-y-4">
                    <div className="bg-blue-600 text-white p-5 rounded-2xl flex items-center justify-between shadow-lg">
                      <div className="flex items-center gap-3">
                        <Award size={28} className="text-yellow-300" />
                        <div>
                          <p className="font-bold text-xl">التقييم العام</p>
                          <p className="text-blue-100 text-sm">من إجمالي ١١ نقطة</p>
                        </div>
                      </div>
                      <p className="text-4xl font-extrabold">{employee.points?.toFixed(1)}</p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
                      <div className="bg-white p-4 rounded-xl border shadow-sm flex flex-col justify-between">
                        <div>
                          <p className="text-gray-500 text-sm font-bold mb-1">نقاط التقييمات الإيجابية</p>
                          <p className="text-xs text-gray-400">من أصل ٥ نقاط</p>
                        </div>
                        <p className="text-2xl font-bold text-green-600 mt-2">{employee.stats?.positive?.toFixed(1) || '0.0'}</p>
                      </div>
                      
                      <div className="bg-white p-4 rounded-xl border shadow-sm flex flex-col justify-between">
                        <div>
                          <p className="text-gray-500 text-sm font-bold mb-1">نقاط التقييمات السلبية</p>
                          <p className="text-xs text-gray-400">من أصل ٢ نقاط</p>
                        </div>
                        <p className="text-2xl font-bold text-red-500 mt-2">{employee.stats?.negative?.toFixed(1) || '0.0'}</p>
                      </div>

                      <div className="bg-white p-4 rounded-xl border shadow-sm flex flex-col justify-between sm:col-span-2">
                        <div>
                          <p className="text-gray-500 text-sm font-bold mb-1">نقاط الجودة (الشكاوى والسلامة)</p>
                          <p className="text-xs text-gray-400">من أصل ٤ نقاط</p>
                        </div>
                        <p className="text-2xl font-bold text-blue-600 mt-2">{((employee.stats?.complaints === 0 && employee.stats?.safety === 0) ? 4 : (4 - (employee.stats?.complaints || 0) - (employee.stats?.safety || 0))).toFixed(1)}</p>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
              
            </motion.div>
          </div>
        )}
      </AnimatePresence>, document.body)}
      <ShiftDetailsModal shift={selectedShift} onClose={() => setSelectedShift(null)} reviews={reviews} users={users} />
    </>
  );
};

{/* Shift Details Modal */}
export const ShiftDetailsModal = ({ shift, onClose, reviews, users }: { shift: TimelineEvent | null, onClose: () => void, reviews: any[], users: any[] }) => {
  if (!shift) return null;
  const shiftReviews = reviews.filter(r => r.branch === shift.branch && r.date === shift.date).sort(newestFirst);
  
  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 touch-auto font-alexandria" dir="rtl">
         <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
         <motion.div initial={{y:50, opacity:0}} animate={{y:0, opacity:1}} exit={{y:50, opacity:0}} className="relative w-full max-w-lg bg-gray-100 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="bg-white p-4 shadow-sm z-10 flex justify-between items-center shrink-0">
               <div>
                 <h3 className="text-lg font-bold text-gray-800">{shift.branch} - {formatDate(shift.date) || 'اليوم'}</h3>
                 <p className="text-sm text-gray-500">{shiftName(shift.time)} · {formatTime(shift.time)} - {shift.endTime ? formatTime(shift.endTime) : 'نهاية اليوم'}</p>
               </div>
               <button onClick={onClose} className="p-2 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-600"><X size={20}/></button>
            </div>
            <div className="p-4 bg-white mt-1 shadow-sm shrink-0">
               <p className="text-sm font-bold text-gray-800 mb-2">فريق الشفت:</p>
               <div className="flex flex-wrap gap-2">
                  {shift.employees?.map((e, i) => <span key={i} className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs font-bold border border-blue-100">{e.name}</span>)}
               </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
               <h4 className="font-bold text-gray-700 mb-2">تقييمات الشفت:</h4>
               {shiftReviews.length === 0 ? (
                  <p className="text-center text-gray-500 py-4">لا توجد تقييمات مسجلة في هذا الشفت.</p>
               ) : (
                  shiftReviews.map(r => (
                     <div key={r.id} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                       <div className="flex justify-between items-start mb-2">
                          <div className="flex items-center gap-3">
                             <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-lg shrink-0">{r.reviewerName.charAt(0)}</div>
                             <div>
                                <p className="font-bold text-gray-800 text-sm">{r.reviewerName}</p>
                                <div className="flex items-center gap-1 mt-0.5">
                                  {[1,2,3,4,5].map(s => <Star key={s} size={12} className={s <= parseInt(r.rating) ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200'} />)}
                                  <span className="text-[10px] text-gray-400 mr-2">{formatTime(r.time)}</span>
                                </div>
                             </div>
                          </div>
                       </div>
                       <p className="text-gray-700 text-sm mt-3 leading-relaxed">{r.comment || 'لا يوجد تعليق'}</p>
                       <div className="mt-3 pt-3 border-t border-gray-50">
                          <p className="text-[10px] text-gray-400 font-bold">اكتسب بواسطة:</p>
                          <p className="text-xs text-blue-600 font-medium">{r.linkedEmployeeIds?.map((id: string) => users.find((u: any) => u.id===id)?.name || id).join('، ') || 'غير محدد'}</p>
                       </div>
                     </div>
                  ))
               )}
            </div>
         </motion.div>
      </div>
    </AnimatePresence>
  );
};
