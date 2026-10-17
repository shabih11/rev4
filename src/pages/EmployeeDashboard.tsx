import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { LogOut, Star, Award, ShieldAlert, AlertTriangle, CalendarClock, ChevronDown, ChevronUp } from 'lucide-react';

export const EmployeeDashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const { addTimelineEvent, reviews, users, timeline } = useData();
  const [showReviews, setShowReviews] = useState(false);
  const [showShifts, setShowShifts] = useState(false);

  if (!user) return null;

  return (
    <div className="w-full min-h-screen bg-gray-50 font-alexandria" dir="rtl">
      {/* Header */}
      <div className="bg-white pt-6 px-6 shadow-sm rounded-b-3xl mb-6 relative overflow-hidden flex flex-col items-center border-b">
        <div className="flex justify-between items-center w-full z-10 mb-4">
          <div>
            <h1 className="text-2xl font-bold mb-1 text-gray-800">أهلاً، {user.name}</h1>
            <p className="text-blue-600 font-bold">{user.branch}</p>
          </div>
          <button 
            onClick={logout}
            className="p-3 bg-gray-100 text-gray-600 hover:bg-gray-200 rounded-full transition-colors"
          >
            <LogOut size={24} />
          </button>
        </div>
        
        {/* Employee Image */}
        <div className="relative w-full flex justify-center mt-2 flex-1">
          <img 
            src={user.imageUrl} 
            alt={user.name}
            className="h-64 object-contain align-bottom"
            style={{ display: 'block' }}
          />
        </div>
      </div>

      {/* Main Stats */}
      <div className="px-6 mb-8">
        <div className="bg-white rounded-3xl p-8 shadow-xl flex items-center justify-between">
          <div>
            <p className="text-gray-500 font-bold mb-1">النقاط الكلية</p>
            <h2 className="text-5xl font-extrabold text-gray-800">{user.points.toFixed(1)}</h2>
          </div>
          <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center text-blue-500">
            <Award size={40} />
          </div>
        </div>
      </div>

      {/* Detailed Stats Grid */}
      <div className="px-6 grid grid-cols-2 gap-4 mb-8">
        <div className="bg-white p-6 rounded-3xl shadow-lg border-t-4 border-yellow-400">
          <div className="flex items-center gap-2 text-gray-700 mb-2 font-bold">
            <Star className="text-yellow-400" size={20} />
            التقييمات
          </div>
          <p className="text-3xl font-extrabold">{user.reviewsCount}</p>
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-lg border-t-4 border-green-500">
          <div className="flex items-center gap-2 text-gray-700 mb-2 font-bold">
            <Star className="text-green-500" size={20} />
            إيجابي
          </div>
          <p className="text-3xl font-extrabold">+{user.stats.positive.toFixed(1)}</p>
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-lg border-t-4 border-red-500">
          <div className="flex items-center gap-2 text-gray-700 mb-2 font-bold">
            <AlertTriangle className="text-red-500" size={20} />
            شكاوى
          </div>
          <p className="text-3xl font-extrabold">-{user.stats.complaints}</p>
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-lg border-t-4 border-orange-500">
          <div className="flex items-center gap-2 text-gray-700 mb-2 font-bold">
            <ShieldAlert className="text-orange-500" size={20} />
            مخالفات سلامة
          </div>
          <p className="text-3xl font-extrabold">-{user.stats.safety}</p>
        </div>
      </div>

      {/* Reviews Log Section */}
      <div className="px-6 mb-4">
        <button 
          onClick={() => setShowReviews(!showReviews)}
          className="w-full bg-white rounded-2xl p-5 shadow-lg flex justify-between items-center"
        >
          <div className="flex items-center gap-3">
            <Star className="text-yellow-400" size={22} />
            <span className="font-bold text-gray-800 text-lg">سجل التقييمات</span>
          </div>
          {showReviews ? <ChevronUp className="text-gray-400" /> : <ChevronDown className="text-gray-400" />}
        </button>
        
        {showReviews && (
          <div className="bg-white rounded-b-2xl border-t px-5 pb-5 shadow-lg -mt-2 space-y-3 pt-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-gray-500 font-bold">إجمالي التقييمات المرتبطة</p>
              <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-sm font-bold">{user.reviewsCount}</span>
            </div>

            {reviews.filter(r => r.linkedEmployeeIds.includes(user.id)).length === 0 && (
              <p className="text-center text-gray-500 text-sm">لا يوجد تقييمات مرتبطة بك بعد.</p>
            )}

            {reviews.filter(r => r.linkedEmployeeIds.includes(user.id)).map(r => {
              const ratingNum = parseInt(r.rating) || 0;
              const isPositive = ratingNum >= 4;
              const stars = '★'.repeat(ratingNum) + '☆'.repeat(5 - ratingNum);
              const otherEmpNames = r.linkedEmployeeIds
                .filter(id => id !== user.id)
                .map(id => users.find(u => u.id === id)?.name || id)
                .join(' و ');
                
              let shiftInfo = '';
              if (r.linkedShiftId) {
                const s = timeline.find(t => t.id === r.linkedShiftId);
                if (s) shiftInfo = `في شفت (${s.time} - ${s.endTime || 'نهاية اليوم'})`;
              }

              return (
                <div key={r.id} className={`${isPositive ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'} p-4 rounded-xl border`}>
                  <div className="flex justify-between items-center mb-2">
                    <div className="flex text-yellow-400 text-sm">{stars}</div>
                    <div className="text-xs text-gray-500 font-medium bg-white px-2 py-1 rounded">{r.date} - {r.time}</div>
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
            {timeline.filter(t => t.type === 'gap' && t.title.includes(user.name)).map(t => (
              <div key={t.id} className={`${t.title.includes('سلامة') ? 'bg-red-50 border-red-100' : 'bg-orange-50 border-orange-100'} p-4 rounded-xl border`}>
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className={t.title.includes('سلامة') ? 'text-red-500' : 'text-orange-500'} size={16} />
                  <span className={`${t.title.includes('سلامة') ? 'text-red-700' : 'text-orange-700'} font-bold text-sm`}>{t.title.split(' - ')[0]}</span>
                </div>
                <p className="text-gray-700 text-sm">"{t.comment}"</p>
                <div className="flex justify-between items-center mt-2">
                  <p className="text-xs text-gray-500">الوقت: {t.time}</p>
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
          <div className="bg-white rounded-b-2xl border-t px-5 pb-5 shadow-lg -mt-2 space-y-3 pt-4">
            {timeline.filter(event => event.type === 'shift' && event.employees?.some(employee => employee.id === user.id)).map(event => (
              <div key={event.id} className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                <p className="font-bold text-gray-800">{event.date} — {event.time} إلى {event.endTime || 'غير محدد'}</p>
                <p className="text-xs text-gray-500 mt-1">{event.branch} · {event.employees?.map(employee => employee.name).join('، ')}</p>
              </div>
            ))}
            {!timeline.some(event => event.type === 'shift' && event.employees?.some(employee => employee.id === user.id)) && <p className="text-sm text-gray-500">لا توجد شفتات مسجلة.</p>}
          </div>
        )}
      </div>

      {/* Shift Information & Objection */}
      <div className="px-6 mb-8">
        <div className="bg-white rounded-3xl p-6 shadow-lg border border-blue-50">
          <h3 className="font-bold text-xl mb-4 text-gray-800">شفت اليوم</h3>
          
          <div className="bg-blue-50 p-4 rounded-xl flex justify-between items-center mb-4">
            <div>
              <p className="text-blue-800 font-bold text-lg">من 16:00 إلى 00:00</p>
              <p className="text-blue-600 text-sm">تم تسجيل حضورك في هذا الشفت.</p>
            </div>
            <div className="bg-green-100 text-green-700 px-3 py-1 rounded-full font-bold text-sm">
              نشط
            </div>
          </div>

          <div className="border-t pt-4">
            <p className="text-gray-500 text-sm mb-3">هل نسيت مديرة الفرع تسجيل الشفت الخاص بك؟</p>
            <button 
              onClick={() => {
                addTimelineEvent({
                  branch: user.branch,
                  type: 'gap',
                  title: `اعتراض شفت مفقود - ${user.name}`,
                  time: new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }),
                  comment: 'الموظفة تطالب بتسجيل الشفت الخاص بها ولم تقم المديرة بذلك.'
                });
                alert('تم إرسال الاعتراض إلى الإدارة.');
              }}
              className="w-full bg-white border-2 border-red-100 text-red-500 hover:bg-red-50 hover:border-red-200 py-3 rounded-xl font-bold transition-all"
            >
              تقديم اعتراض على شفت مفقود
            </button>
          </div>
        </div>
      </div>

    </div>
  );
};
