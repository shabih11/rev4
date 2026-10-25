import { gemTheme } from '../lib/gems';
import { EmployeeAvatar, BalanceGrowth, Overtaken } from '../components/EmployeeFeatures';
import { employeeTier } from '../lib/employeeFeatures';
import { Brand } from '../components/Brand';
import { MissingShiftRequest } from '../components/MissingShiftRequest';
import { EmployeeResults } from '../components/EmployeeResults';
import { LeaderboardLink } from '../components/LeaderboardLink';
import React, { useState } from 'react';
import { ShiftReviewCounts } from '../components/ShiftReviewCounts';
import { newestFirst } from '../lib/employeeActivity';
import { useAuth } from '../context/AuthContext';
import { formatDateTime, formatDate, formatTime, shiftName, toEnglishNumerals } from '../lib/formatDate';
import { useData } from '../context/DataContext';
import { useRecordScope } from '../hooks/useRecordScope';
import { LogOut, Star, Award, AlertTriangle, CalendarClock, ChevronDown, ChevronUp, User } from 'lucide-react';
import { UserProfileTab } from '../components/UserProfileTab';

export const EmployeeDashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const { reviews, reviewSummaries, recordsReady, summaryReady, summaryGeneratedAt, syncError, users, timeline, features } = useData();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'profile'>('dashboard');
  const [showReviews, setShowReviews] = useState(false);
  const [showShifts, setShowShifts] = useState(false);
  useRecordScope({ reviews: activeTab === 'dashboard' && showReviews ? { employeeIds: [user?.id || ''] } : undefined, timeline: activeTab === 'dashboard' ? { employeeIds: [user?.id || ''] } : undefined });

  if (!user) return null;
  const privateReviews = new Map(reviews.map(review => [review.id, review]));
  const countReviews = reviewSummaries.map(summary => ({ ...summary, linkedShiftId: privateReviews.get(summary.id)?.linkedShiftId }));
  const employeeReviews = reviews.filter(review => review.linkedEmployeeIds.includes(user.id)).sort(newestFirst);
  const employeeShifts = timeline.filter(event => event.type === 'shift' && event.employees?.some(employee => employee.id === user.id)).sort(newestFirst);
  const detailsReady = recordsReady && !syncError;


  return (
    <div data-gem-theme={gemTheme(features?.store?.magic, user.id)} className="gem-employee-page w-full min-h-screen bg-gray-50 font-sans pb-24" dir="rtl">
      {activeTab === 'profile' ? (
        <div className="p-4 sm:p-6 max-w-2xl mx-auto">
          <UserProfileTab />
        </div>
      ) : (
        <>
          {/* Header */}
          <div className="bg-white pt-6 px-6 shadow-sm rounded-b-3xl mb-6 relative overflow-hidden flex flex-col items-center border-b">
        <div className="flex justify-between items-center w-full z-10 mb-4">
          <div>
            <Brand compact />
            <h1 className="text-2xl font-bold mb-1 text-gray-800">أهلاً، <span className="employee-tier-name" data-tier={summaryReady && features ? employeeTier(user.points, features.settings) : 'bronze'}>{user.name}</span></h1>
            <p className="text-blue-600 font-bold">{user.branch}</p>
          </div>
          <div className="flex items-center gap-2">
            <LeaderboardLink />
          <button 
            aria-label="تسجيل الخروج"
            onClick={logout}
            className="p-3 bg-gray-100 text-gray-600 hover:bg-gray-200 rounded-full transition-colors"
          >
            <LogOut size={24} />
          </button>
          </div>
        </div>
        
        {/* Employee Image */}
        <div className="relative w-full flex justify-center mt-2 flex-1">
          <EmployeeAvatar employee={user} className="h-24 sm:h-32 w-24 sm:w-32" />
        </div>
      </div>

      {summaryReady && <div className="px-6 mb-5"><p className="font-bold text-slate-800">رصيد الشهر: {user.monthReviewsCount || 0} <BalanceGrowth employee={user} /></p><Overtaken employee={user} /></div>}
      <EmployeeResults user={user} ready={summaryReady} generatedAt={summaryGeneratedAt} error={syncError} />

      {/* Reviews Log Section */}
      <div className="px-6 mb-4">
        <button 
          aria-expanded={showReviews}
          aria-controls="employee-reviews"
          onClick={() => setShowReviews(!showReviews)}
          className="w-full bg-white rounded-2xl p-5 shadow-lg flex justify-between items-center"
        >
          <div className="flex items-center gap-3">
            <Star className="text-yellow-400" size={22} />
            <span className="font-bold text-gray-800 text-lg">سجل التقييمات</span><span className="font-bold text-gray-700">{summaryReady ? user.reviewsCount : '…'}</span>
          </div>
          {showReviews ? <ChevronUp className="text-gray-400" /> : <ChevronDown className="text-gray-400" />}
        </button>
        
        {showReviews && (
          <div id="employee-reviews" className="bg-white rounded-b-2xl border-t px-5 pb-5 shadow-lg -mt-2 space-y-3 pt-4">
            {syncError ? <p role="alert" className="text-red-700">{syncError}</p> : !recordsReady && <p role="status">جارٍ تحميل السجلات المطلوبة…</p>}


            {detailsReady && employeeReviews.length === 0 && (
              <p className="text-center text-gray-500 text-sm">لا يوجد تقييمات مرتبطة بك بعد.</p>
            )}

            {detailsReady && employeeReviews.map(r => {
              const ratingNum = Math.min(5, Math.max(0, parseInt(toEnglishNumerals(r.rating), 10) || 0));
              const isPositive = ratingNum >= 4;
              const stars = '★'.repeat(ratingNum) + '☆'.repeat(5 - ratingNum);
              const otherEmpNames = r.linkedEmployeeIds
                .filter(id => id !== user.id)
                .map(id => users.find(u => u.id === id)?.name || id)
                .join(' و ');
                
              let shiftInfo = '';
              if (r.linkedShiftId) {
                const s = timeline.find(t => t.id === r.linkedShiftId);
                if (s) shiftInfo = `في ${shiftName(s.time)} (${formatTime(s.time)} - ${s.endTime ? formatTime(s.endTime) : 'نهاية اليوم'})`;
              }

              return (
                <div key={r.id} className={`${isPositive ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'} p-4 rounded-xl border`}>
                  <div className="flex justify-between items-center mb-2">
                    <div className="flex text-yellow-400 text-sm">{stars}</div>
                    <div className="text-xs text-gray-500 font-medium bg-white px-2 py-1 rounded">{formatDateTime(r.date, r.time)}</div>
                  </div>
                  <p className="text-gray-700 text-sm">"{r.comment}"</p>
                  
                  {(otherEmpNames || shiftInfo) && (
                    <div className="mt-2 flex flex-col gap-1">
                      {otherEmpNames && <p className="text-xs text-gray-500 font-bold">(اكتسبته مع {otherEmpNames})</p>}
                      {shiftInfo && <p className="text-xs text-indigo-500 font-bold">{shiftInfo}</p>}
                    </div>
                  )}
                  {!isPositive && <p className="text-xs text-red-400 mt-2 font-bold">تقييم سلبي</p>}
                </div>
              );
            })}
            
            {/* Display Complaints / Safety gaps assigned to this employee */}
            {detailsReady && timeline.filter(t => t.type === 'gap' && t.title.includes(user.name)).map(t => (
              <div key={t.id} className={`${t.title.includes('سلامة') ? 'bg-red-50 border-red-100' : 'bg-orange-50 border-orange-100'} p-4 rounded-xl border`}>
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className={t.title.includes('سلامة') ? 'text-red-500' : 'text-orange-500'} size={16} />
                  <span className={`${t.title.includes('سلامة') ? 'text-red-700' : 'text-orange-700'} font-bold text-sm`}>{t.title.split(' - ')[0]}</span>
                </div>
                <p className="text-gray-700 text-sm">"{t.comment}"</p>
                <div className="flex justify-between items-center mt-2">
                  <p className="text-xs text-gray-500">الوقت: {formatTime(t.time)}</p>
                  <p className={`text-xs ${t.title.includes('سلامة') ? 'text-red-400' : 'text-orange-400'}`}>مسجلة بواسطة الإدارة</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Shifts Log Section */}
      <div className="px-6 mb-8">
        <button 
          aria-expanded={showShifts}
          aria-controls="employee-shifts"
          onClick={() => setShowShifts(!showShifts)}
          className="w-full bg-white rounded-2xl p-5 shadow-lg flex justify-between items-center"
        >
          <div className="flex items-center gap-3">
            <CalendarClock className="text-blue-500" size={22} />
            <span className="font-bold text-gray-800 text-lg">سجل الشفتات</span>
          </div>
          {showShifts ? <ChevronUp className="text-gray-400" /> : <ChevronDown className="text-gray-400" />}
        </button>
        
        {showShifts && (
          <div id="employee-shifts" className="bg-white rounded-b-2xl border-t px-5 pb-5 shadow-lg -mt-2 space-y-3 pt-4">
            {syncError ? <p role="alert" className="text-red-700">{syncError}</p> : !recordsReady && <p role="status">جارٍ تحميل السجلات المطلوبة…</p>}
            {detailsReady && employeeShifts.map(event => (
              <div key={event.id} className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex items-center justify-between gap-3">
                <div className="min-w-0">
                <p className="font-bold text-gray-800">{formatDate(event.date)} <span className="text-xs font-medium text-gray-500">({shiftName(event.time)})</span></p>
                <p className="text-xs text-gray-500 mt-1">{event.employees?.filter(employee => employee.id !== user.id).length ? `مع ${event.employees.filter(employee => employee.id !== user.id).map(employee => employee.name).join(' و')}` : 'بدون شريكة'}</p>
                </div>
                <ShiftReviewCounts shift={event} employeeId={user.id} reviews={countReviews} ready={recordsReady} />
              </div>
            ))}
            {detailsReady && employeeShifts.length === 0 && <p className="text-sm text-gray-500">لا توجد شفتات مسجلة.</p>}
          </div>
        )}
      </div>

      {/* Shift Information & Objection */}
      <div className="px-6 mb-8">
        <div className="bg-white rounded-3xl p-6 shadow-lg border border-blue-50">
          <div className="pt-4">
            <p className="text-gray-500 text-sm mb-3">هل نسيت مديرة الفرع تسجيل الشفت الخاص بك؟</p>
            <h3 className="font-bold mb-4">طلب تسجيل شفت مفقود</h3>
            <MissingShiftRequest />
          </div>
        </div>
      </div>
      </>
      )}

      {/* Bottom Navigation */}
      <nav aria-label="تنقل الموظفة" className="fixed bottom-0 left-0 right-0 w-full bg-white/95 backdrop-blur-lg border-t border-slate-200 shadow-[0_-10px_35px_-10px_rgba(0,0,0,0.1)] z-40 px-4 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex justify-around items-center">
        <button
          aria-current={activeTab === 'dashboard' ? 'page' : undefined}
          onClick={() => setActiveTab('dashboard')}
          className={`tab-button ${
            activeTab === 'dashboard'
              ? 'text-blue-700 bg-blue-50 font-black'
              : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <Award size={22} className={activeTab === 'dashboard' ? 'stroke-[2.5px]' : ''} />
          <span className="text-[11px] font-bold">لوحتي</span>
        </button>

        <button
          aria-current={activeTab === 'profile' ? 'page' : undefined}
          onClick={() => setActiveTab('profile')}
          className={`tab-button ${
            activeTab === 'profile'
              ? 'text-blue-700 bg-blue-50 font-black'
              : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <User size={22} className={activeTab === 'profile' ? 'stroke-[2.5px]' : ''} />
          <span className="text-[11px] font-bold">شخصي</span>
        </button>
      </nav>
    </div>
  );
};
