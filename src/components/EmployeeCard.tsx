import { employeeQualityPoints } from '../lib/employeeQuality';
import { EmployeeIdentity } from './EmployeeIdentity';
import { arabicReviewCount } from '../lib/arabicReviewCount';
import { shiftReviewCounts } from '../lib/shiftReviewCounts';
import { employeeReviewBranches } from '../lib/employeeBranches';
import { gemTheme } from '../lib/gems';
import { EmployeeAvatar, BalanceGrowth } from './EmployeeFeatures';
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ShiftReviewCounts } from './ShiftReviewCounts';
import { favoritePartner, newestFirst } from '../lib/employeeActivity';
import type { UserAccount } from '../lib/mockData';
import { X, CalendarClock, Star, Clock, Award } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useData } from '../context/DataContext';
import { useRecordScope } from '../hooks/useRecordScope';
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

  useEffect(() => {
    if (showModal) {
      onModalOpen?.();
    } else {
      onModalClose?.();
    }
  }, [showModal, onModalOpen, onModalClose]);

  return (
    <>
      <span className="block" onClick={event => { event.stopPropagation(); setShowModal(true); }}>
        {children}
      </span>

      {showModal && typeof document !== 'undefined' && createPortal(
        <EmployeeModalContent 
          employee={employee} 
          onClose={() => setShowModal(false)} 
        />,
        document.body
      )}
    </>
  );
};

const EmployeeModalContent: React.FC<{ employee: UserAccount; onClose: () => void }> = ({ employee, onClose }) => {
  const [activeTab, setActiveTab] = useState<'reviews' | 'shifts' | 'summary' | 'points'>('summary');
  const { reviews, reviewSummaries, users, timeline, recordsReady, summaryReady, employeeHours, syncError, features, currentAccount } = useData();
  useRecordScope({ users: currentAccount?.role === 'admin', reviews: { employeeIds: [employee.id] }, timeline: { employeeIds: [employee.id] } });
  const multipleReviewBranches = employeeReviewBranches(reviewSummaries, employee.id).length > 1;
  const [selectedShift, setSelectedShift] = useState<TimelineEvent | null>(null);

  const privateReviews = new Map(reviews.map(review => [review.id, review]));
  const employeeReviews = (activeTab !== 'points' ? reviews : reviewSummaries)
    .filter(review => review.linkedEmployeeIds.includes(employee.id))
    .map(review => ({
      ...review,
      comment: privateReviews.get(review.id)?.comment ?? (review as any).comment,
      linkedShiftId: privateReviews.get(review.id)?.linkedShiftId ?? (review as any).linkedShiftId
    }))
    .sort(newestFirst);

  const isEmpMatch = (id?: string, _name?: string) => id === employee.id;

  const employeeShifts = timeline.filter(t => t.type === 'shift' && t.employees?.some(e => isEmpMatch(e.id, e.name))).sort(newestFirst);

  const latestShift = employeeShifts[0];
  const latestShiftSummary = latestShift ? `${formatDateTime(latestShift.date)} ${arabicReviewCount(shiftReviewCounts(latestShift, employee.id, reviews).total)}`.replace(/[0-9]/g, digit => '٠١٢٣٤٥٦٧٨٩'[Number(digit)]) : 'لا توجد شفتات مسجلة';

  const partner = favoritePartner(employee.id, reviewSummaries);
  const favoritePartnerName = users.find(user => user.id === partner.id)?.name || '';

  const totalHours = Math.round(employeeHours[employee.id] ?? employeeShifts.reduce((total, shift) => {
    const minutes = (t: string) => { const [h,m] = t.split(':').map(Number); return h*60+m; };
    let duration = minutes(shift.endTime || shift.time) - minutes(shift.time);
    if (duration < 0) duration += 1440;
    return total + (Number.isFinite(duration) ? duration / 60 : 0);
  }, 0));
  const tabReady = activeTab === 'summary' || activeTab === 'points' ? summaryReady : recordsReady;

  return (
    <>
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
          onClick={onClose}
        />
        
        {/* Modal */}
        <motion.div 
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          data-gem-theme={gemTheme(features?.store?.magic, employee.id)}
          className="gem-employee-page relative w-full max-w-2xl min-w-0 bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="glass-modal-header p-4 sm:p-6 flex justify-between items-center sticky top-0 z-10">
            <h2 className="min-w-0 flex flex-wrap items-baseline gap-x-2 text-xl sm:text-2xl">
              <span className="font-extrabold break-words">{employee.name}</span>
              <span className="text-base sm:text-xl font-medium break-words">({employee.branch})</span>
            </h2>
            <button 
              onClick={onClose}
              className="glass-modal-control p-2 rounded-full transition-colors self-start shrink-0"
              aria-label="إغلاق"
            >
              <X size={20} />
            </button>
          </div>

          <div className="border-b bg-white px-4 py-3 text-sm text-slate-700" role="status">
            <span className="font-bold">آخر شفت مسجل: </span>
            {syncError ? 'تعذر تحميل آخر شفت' : !recordsReady ? 'جارٍ التحميل…' : latestShiftSummary}
          </div>
          {/* Tabs */}
          <div className="flex gap-1 border-b p-2 bg-slate-50">
            <button 
              onClick={() => setActiveTab('reviews')}
              className={`flex-1 min-h-11 rounded-xl px-2 py-3 text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-colors ${activeTab === 'reviews' ? 'bg-white shadow-sm text-blue-700' : 'text-gray-500'}`}
            >
              <Star size={18} />
              تقييماتي
            </button>
            <button 
              onClick={() => setActiveTab('shifts')}
              className={`flex-1 min-h-11 rounded-xl px-2 py-3 text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-colors ${activeTab === 'shifts' ? 'bg-white shadow-sm text-blue-700' : 'text-gray-500'}`}
            >
              <CalendarClock size={18} />
              شفتاتي
            </button>
            <button 
              onClick={() => setActiveTab('summary')}
              className={`flex-1 min-h-11 rounded-xl px-2 py-3 text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-colors ${activeTab === 'summary' ? 'bg-white shadow-sm text-blue-700' : 'text-gray-500'}`}
            >
              <Award size={18} />
              ملخصي
            </button>
          </div>

          {/* Body */}
          <div className={`p-4 sm:p-6 h-[50vh] overflow-y-auto ${activeTab === 'summary' ? 'bg-white' : 'bg-gray-50'}`}>
            {syncError ? <p role="alert" className="text-red-700 text-center">{syncError}</p> : !tabReady && <p role="status" className="text-center text-gray-500">جارٍ تحميل السجلات…</p>}
            {activeTab === 'reviews' ? (
              <div className="space-y-4 pt-2 pb-2">
                {(recordsReady ? employeeReviews : []).map(r => {
                  const linkedNames = r.linkedEmployeeIds.map((id: string) => users.find((u: any) => u.id === id)?.name).filter(Boolean).join('، ');
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
                      {r.comment ? (
                        <p className="text-gray-700 text-sm whitespace-pre-wrap">{r.comment}</p>
                      ) : (
                        <p className="text-gray-400 text-xs italic">تقييم بدون تعليق</p>
                      )}
                      {multipleReviewBranches && r.branch && (
                        <span className="mt-3 inline-flex rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-800">فرع {r.branch}</span>
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
                {(employeeHours[employee.id] !== undefined || recordsReady) && (
                  <div className="bg-transparent border border-gray-200 text-gray-700 p-2 rounded-xl flex items-center justify-center gap-2 shadow-sm mb-4">
                    <Clock size={18} className="text-blue-600" />
                    <p className="font-bold text-sm">{totalHours} ساعات في صناعة تجربة العميل</p>
                  </div>
                )}

                {employeeShifts.length > 0 ? employeeShifts.map((shift, idx) => {
                  return (
                    <div key={shift.id || idx} onClick={() => setSelectedShift(shift)} className="bg-white p-4 rounded-xl border shadow-sm flex items-center justify-between gap-3 cursor-pointer hover:bg-gray-50 transition-colors">
                      <div className="min-w-0">
                        <p className="font-bold text-gray-800">{formatDate(shift.date)} <span className="text-xs font-medium text-gray-500">({shiftName(shift.time)})</span></p>
                        <p className="text-xs text-gray-400 mt-1">{shift.employees?.filter(e => users.some(user => user.id === e.id) && !isEmpMatch(e.id, e.name)).length ? `مع ${shift.employees.filter(e => users.some(user => user.id === e.id) && !isEmpMatch(e.id, e.name)).map(e => e.name).join(' و')}` : 'بدون شريكة'}</p>
                      </div>
                      <ShiftReviewCounts shift={shift} employeeId={employee.id} reviews={employeeReviews} ready={recordsReady} />
                    </div>
                  );
                }) : (
                  recordsReady && !syncError && <p className="text-center text-gray-500 py-10">لا توجد شفتات مسجلة.</p>
                )}
              </div>
            ) : activeTab === 'summary' ? (
              summaryReady && !syncError ? <section className="grid grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] items-center gap-3 sm:gap-6 min-h-full text-slate-800" aria-label="ملخص بيانات الموظفة">
                <div className="min-w-0 space-y-4 text-right">
                  <EmployeeIdentity employee={employee} className="items-start text-lg sm:text-2xl" />
                  <dl className="space-y-3 text-sm">
                    <div><dt className="text-xs text-slate-500">رصيد الشهر</dt><dd className="font-extrabold text-lg">{arabicReviewCount(employee.monthReviewsCount ?? 0)} <BalanceGrowth employee={employee} /></dd></div>
                    <div><dt className="text-xs text-slate-500">النقاط</dt><dd><button type="button" onClick={() => setActiveTab('points')} aria-label="عرض تفاصيل النقاط من الملخص" className="font-extrabold text-lg underline decoration-slate-300 underline-offset-4">{employee.points.toFixed(1)}</button></dd></div>
                    <div><dt className="text-xs text-slate-500">إجمالي التقييمات</dt><dd className="font-extrabold text-lg">{arabicReviewCount(employee.reviewsCount ?? 0)}</dd></div>
                    {favoritePartnerName && <div><dt className="text-xs text-slate-500">شريكتي المفضلة</dt><dd className="font-bold break-words">{favoritePartnerName}</dd></div>}
                  </dl>
                </div>
                <EmployeeAvatar employee={employee} className="block w-full h-[clamp(240px,38svh,360px)]" />
              </section> : null
            ) : activeTab === 'points' ? (
              <div className="space-y-4">
                <div className="bg-blue-600 text-white p-5 rounded-2xl flex items-center justify-between shadow-lg">
                  <div className="flex items-center gap-3">
                    <Award size={28} className="text-yellow-300" />
                    <div>
                      <p className="font-bold text-xl">نقاط الشهر الحالي</p>
                      <p className="text-blue-100 text-sm">من إجمالي 11 نقطة</p>
                    </div>
                  </div>
                  <p className="text-4xl font-extrabold">{employee.points?.toFixed(1)}</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
                  <div className="bg-white p-4 rounded-xl border shadow-sm flex flex-col justify-between">
                    <div>
                      <p className="text-gray-500 text-sm font-bold mb-1">نقاط الإيجابية</p>
                      <p className="text-xs text-gray-400">من أصل 5 نقاط</p>
                    </div>
                    <p className="text-2xl font-bold text-green-600 mt-2">{employee.stats?.positive?.toFixed(1) || '0.0'}</p>
                  </div>
                  
                  <div className="bg-white p-4 rounded-xl border shadow-sm flex flex-col justify-between">
                    <div>
                      <p className="text-gray-500 text-sm font-bold mb-1">الجودة (تقييمات سلبية، حوادث سلامة، شكاوى مؤكدة)</p>
                      <p className="text-xs text-gray-400">من أصل ٦ نقاط</p>
                    </div>
                    <p className="text-2xl font-bold text-blue-600 mt-2">{employeeQualityPoints(employee.stats).toFixed(1)}</p>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </motion.div>
      </div>

      <ShiftDetailsModal shift={selectedShift} onClose={() => setSelectedShift(null)} reviews={reviews} users={users} />
    </>
  );
};

{/* Shift Details Modal */}
export const ShiftDetailsModal = ({ shift, onClose, reviews, users }: { shift: TimelineEvent | null, onClose: () => void, reviews: any[], users: any[] }) => {
  useRecordScope(shift ? { reviews: { branches: [shift.branch] } } : {});
  const { recordsReady, syncError } = useData();
  if (!shift) return null;
  const shiftReviews = reviews.filter(r => r.linkedShiftId === shift.id).sort(newestFirst);
  
  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 touch-auto font-alexandria" dir="rtl">
         <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
         <motion.div initial={{y:50, opacity:0}} animate={{y:0, opacity:1}} exit={{y:50, opacity:0}} className="relative w-full max-w-lg bg-gray-100 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="glass-modal-header p-4 z-10 flex justify-between items-center shrink-0">
               <div>
                 <h3 className="text-lg font-bold text-gray-800">{shift.branch} - {formatDate(shift.date) || 'اليوم'}</h3>
                 <p className="text-sm text-gray-500">{shiftName(shift.time)} · {formatTime(shift.time)} - {shift.endTime ? formatTime(shift.endTime) : 'نهاية اليوم'}</p>
               </div>
               <button onClick={onClose} className="glass-modal-control p-2 rounded-full" aria-label="إغلاق"><X size={20}/></button>
            </div>
            <div className="p-4 bg-white mt-1 shadow-sm shrink-0">
               <p className="text-sm font-bold text-gray-800 mb-2">فريق الشفت:</p>
               <div className="flex flex-wrap gap-2">
                  {shift.employees?.filter(e => users.some(user => user.id === e.id)).map((e, i) => <span key={i} className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs font-bold border border-blue-100">{e.name}</span>)}
               </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
               <h4 className="font-bold text-gray-700 mb-2">تقييمات الشفت:</h4>
               {!recordsReady ? <p role="status" className="text-center text-gray-500 py-4">جارٍ تحميل تقييمات الشفت…</p> : syncError ? <p role="alert" className="text-red-700">{syncError}</p> : shiftReviews.length === 0 ? (
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
                                  <span className="text-[10px] text-gray-400 mr-2">{formatDateTime(r.date, r.time)}</span>
                                </div>
                             </div>
                          </div>
                       </div>
                       <p className="text-gray-700 text-sm mt-3 leading-relaxed">{r.comment || 'لا يوجد تعليق'}</p>
                       <div className="mt-3 pt-3 border-t border-gray-50">
                          <p className="text-[10px] text-gray-400 font-bold">اكتسب بواسطة:</p>
                          <p className="text-xs text-blue-600 font-medium">{r.linkedEmployeeIds?.map((id: string) => users.find((u: any) => u.id===id)?.name).filter(Boolean).join('، ') || 'غير محدد'}</p>
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
