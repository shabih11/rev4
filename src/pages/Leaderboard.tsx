import React, { useState, useRef, useCallback, useMemo } from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { EffectCreative, Autoplay } from 'swiper/modules';
import { AnimatePresence, motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { X, Building2, Users, Star, MessageSquareHeart, TrendingUp, UserRound, ChevronLeft, ChevronRight } from 'lucide-react';
import 'swiper/css';
import 'swiper/css/effect-creative';
import { EmployeeCard } from '../components/EmployeeCard';
import { useData } from '../context/DataContext';
import { useRecordScope } from '../hooks/useRecordScope';
import { formatDateTime, isWithinLastDays, formatDate} from '../lib/formatDate';
import type { UserAccount } from '../lib/mockData';
import { isInCurrentMonth, isPositiveReview } from '../lib/reviewPeriod';
import { favoritePartner, newestFirst, monthlyEmployeeOrder } from '../lib/employeeActivity';

type SlideData = 
  | { type: 'employee'; data: UserAccount; rank: number }
  | { type: 'partnership'; branch: string; emp1: UserAccount; emp2: UserAccount; count: number }
  | { type: 'active_branch'; branch: string; count: number }
  | { type: 'active_employee'; employee: UserAccount; count: number }
  | { type: 'praised_employee'; employee: UserAccount; count: number; texts: string[] };

const getBusinessDate = (dateStr: string, timeStr: string, branchStartStr: string) => {
  if (!branchStartStr || !dateStr || !timeStr) return dateStr;
  const bTime = parseInt(branchStartStr.replace(':', ''), 10);
  const rTime = parseInt(timeStr.replace(':', ''), 10);
  
  if (rTime < bTime && rTime < 1200) {
    const [d, m, y] = dateStr.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    dateObj.setDate(dateObj.getDate() - 1);
    const pd = String(dateObj.getDate()).padStart(2, '0');
    const pm = String(dateObj.getMonth() + 1).padStart(2, '0');
    const py = dateObj.getFullYear();
    return `${pd}-${pm}-${py}`;
  }
  return dateStr;
};

export const Leaderboard: React.FC = () => {
  const { users, reviews: privateReviews, reviewSummaries, timeline, branchSettings, recordsReady, syncError, currentAccount } = useData();
  const reviews = useMemo(() => {
    const details = new Map(privateReviews.map(review => [review.id, review]));
    return reviewSummaries.map(summary => ({ ...summary, reviewerName: details.get(summary.id)?.reviewerName || '', comment: details.get(summary.id)?.comment || '' })).sort(newestFirst);
  }, [privateReviews, reviewSummaries]);
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [showAllEmployeesModal, setShowAllEmployeesModal] = useState(false);
  const [showAllBranchesModal, setShowAllBranchesModal] = useState(false);
  const [manualBranchName, setManualBranchName] = useState<string | null>(null);
  const [branchModalSelectedDate, setBranchModalSelectedDate] = useState<string | null>(null);
  
  const allEmployeesSorted = useMemo(() => {
    return users.filter(u => u.role === 'employee').sort(monthlyEmployeeOrder);
  }, [users]);

  const slidesData = useMemo(() => {
    // 1. Top 10 Employees
    const sorted = allEmployeesSorted.slice(0, 10);
    
    const sData: SlideData[] = sorted.map((emp, i) => ({ type: 'employee', data: emp, rank: i + 1 }));

    // 2. Partnerships (Best per branch)
    const branchReviewsMap: Record<string, typeof reviews> = {};
    reviews.filter(review => isInCurrentMonth(review.date) && isPositiveReview(review.rating)).forEach(r => {
      if (!branchReviewsMap[r.branch]) branchReviewsMap[r.branch] = [];
      branchReviewsMap[r.branch].push(r);
    });

    Object.keys(branchReviewsMap).forEach(branch => {
      const bReviews = branchReviewsMap[branch];
      const pairCounts: Record<string, number> = {};
      bReviews.forEach(r => {
        if (r.linkedEmployeeIds && r.linkedEmployeeIds.length > 1) {
          for (let i = 0; i < r.linkedEmployeeIds.length; i++) {
            for (let j = i + 1; j < r.linkedEmployeeIds.length; j++) {
              const pair = [r.linkedEmployeeIds[i], r.linkedEmployeeIds[j]].sort().join('|');
              pairCounts[pair] = (pairCounts[pair] || 0) + 1;
            }
          }
        }
      });

      let maxPair = '';
      let maxCount = 0;
      Object.entries(pairCounts).forEach(([pair, count]) => {
        if (count > maxCount) {
          maxCount = count;
          maxPair = pair;
        }
      });

      if (maxPair && maxCount > 0) {
        const [id1, id2] = maxPair.split('|');
        const emp1 = users.find(u => u.id === id1);
        const emp2 = users.find(u => u.id === id2);
        if (emp1 && emp2) {
          sData.push({ type: 'partnership', branch, emp1, emp2, count: maxCount });
        }
      }
    });

    // 3. Most Active Branch (Last 4 days)
    const recentReviews = reviews.filter(r => isWithinLastDays(r.date, 4));
    let mostActiveBranch = '';
    let maxBranchCount = 0;
    const branchCounts: Record<string, number> = {};
    
    let mostActiveEmployeeId = '';
    let maxEmpCount = 0;
    const empCounts: Record<string, number> = {};

    recentReviews.forEach(r => {
      branchCounts[r.branch] = (branchCounts[r.branch] || 0) + 1;
      if (branchCounts[r.branch] > maxBranchCount) {
        maxBranchCount = branchCounts[r.branch];
        mostActiveBranch = r.branch;
      }

      r.linkedEmployeeIds.forEach(id => {
        empCounts[id] = (empCounts[id] || 0) + 1;
        if (empCounts[id] > maxEmpCount) {
          maxEmpCount = empCounts[id];
          mostActiveEmployeeId = id;
        }
      });
    });
    
    const mostActiveEmployee = users.find(u => u.id === mostActiveEmployeeId);

    if (mostActiveBranch && maxBranchCount > 0) {
      sData.push({ type: 'active_branch', branch: mostActiveBranch, count: maxBranchCount });
    }
    if (mostActiveEmployee && maxEmpCount > 0) {
      sData.push({ type: 'active_employee', employee: mostActiveEmployee, count: maxEmpCount });
    }

    // 4. Most Praised Employee (Most reviews this week)
    const weekReviews = reviews.filter(r => isWithinLastDays(r.date, 7));
    let mostPraisedEmpId = '';
    let maxPraiseCount = 0;
    const praiseCounts: Record<string, { count: number, texts: string[] }> = {};

    weekReviews.forEach(r => {
      r.linkedEmployeeIds.forEach(id => {
        if (!praiseCounts[id]) praiseCounts[id] = { count: 0, texts: [] };
        praiseCounts[id].count++;
        if (r.comment && r.comment.length > 3) {
          praiseCounts[id].texts.push(r.comment);
        }
        if (praiseCounts[id].count > maxPraiseCount) {
          maxPraiseCount = praiseCounts[id].count;
          mostPraisedEmpId = id;
        }
      });
    });

    const mostPraisedEmployee = users.find(u => u.id === mostPraisedEmpId);
    if (mostPraisedEmployee && maxPraiseCount > 0) {
      sData.push({ 
        type: 'praised_employee', 
        employee: mostPraisedEmployee, 
        count: maxPraiseCount, 
        texts: praiseCounts[mostPraisedEmpId].texts.slice(0, 3) 
      });
    }

    const order = { praised_employee: 0, active_employee: 1, active_branch: 2, partnership: 3, employee: 4 };
    return sData.sort((a, b) => order[a.type] - order[b.type] || (a.type === 'employee' && b.type === 'employee' ? a.rank - b.rank : a.type === 'partnership' && b.type === 'partnership' ? b.count - a.count : 0));
  }, [allEmployeesSorted, users, reviews]);

  const [activeIndex, setActiveIndex] = useState(0);
  const activeSlide = slidesData[activeIndex] || slidesData[0];
  
  const modalBranchName = manualBranchName || (activeSlide?.type === 'employee' ? activeSlide.data.branch 
    : activeSlide?.type === 'partnership' ? activeSlide.branch 
    : activeSlide?.type === 'active_branch' ? activeSlide.branch 
    : undefined);
  useRecordScope(showBranchModal && modalBranchName ? {
    reviews: { branches: [modalBranchName] },
    timeline: branchModalSelectedDate ? { branches: [modalBranchName] } : undefined,
  } : {});

  const swiperRef = useRef<any>(null);
  const hasInteracted = useRef(false);
  const handleTouchStart = useCallback(() => {
    hasInteracted.current = true;
    swiperRef.current?.swiper?.autoplay.stop();
  }, []);
  const handleModalOpen = handleTouchStart;
  const handleModalClose = useCallback(() => {}, []);
  const activePartner = activeSlide?.type === 'employee' ? favoritePartner(activeSlide.data.id, reviewSummaries) : { id: '', count: 0 };
  const partnerAccount = users.find(user => user.id === activePartner.id);
  const rankNames = ['الأولى', 'الثانية', 'الثالثة', 'الرابعة', 'الخامسة', 'السادسة', 'السابعة', 'الثامنة', 'التاسعة', 'العاشرة'];

  if (slidesData.length === 0) return null;

  return (
    <div 
      className="w-full min-h-screen min-h-[100dvh] bg-white overflow-y-auto overscroll-y-contain flex flex-col justify-between items-center relative font-alexandria touch-pan-y" 
      dir="rtl"
      onPointerDownCapture={handleTouchStart}
      onTouchStartCapture={handleTouchStart}
      onKeyDownCapture={handleTouchStart}
    >
      
      <Link to="/dashboard" className="absolute right-4 top-4 z-40 inline-flex items-center gap-1 text-sm text-blue-600 font-bold bg-white/90 rounded-full px-3 py-2 shadow-sm" aria-label="صفحتي الخاصة"><UserRound size={18}/> صفحتي</Link>
      <div className="absolute inset-x-3 top-[38%] sm:top-[42%] z-40 flex justify-between pointer-events-none" aria-label="تقليب البطاقات">
        <button aria-label="البطاقة السابقة" onClick={() => { handleTouchStart(); swiperRef.current?.swiper?.slidePrev(); }} className="pointer-events-auto rounded-full bg-white/80 border p-2 text-blue-600 shadow"><ChevronRight size={22}/></button>
        <button aria-label="البطاقة التالية" onClick={() => { handleTouchStart(); swiperRef.current?.swiper?.slideNext(); }} className="pointer-events-auto rounded-full bg-white/80 border p-2 text-blue-600 shadow"><ChevronLeft size={22}/></button>
      </div>
      {/* Top Header - Contextual */}
      <AnimatePresence mode="wait">
        <motion.div 
          key={activeIndex + '-header'}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}
          className="w-full px-4 sm:px-8 pt-8 flex justify-end items-start z-10 font-bold text-gray-800"
        >
          <div className="text-3xl sm:text-5xl font-extrabold tracking-tight" dir="rtl">
            {activeSlide.type === 'employee' && <>
              <p>{rankNames[activeSlide.rank - 1] || activeSlide.rank}</p>

            </>}
            {activeSlide.type === 'partnership' && `شراكات الفروع`}
            {activeSlide.type === 'active_branch' && `إحصائية الأسبوع`}
            {activeSlide.type === 'active_employee' && `نشاط الأسبوع`}
            {activeSlide.type === 'praised_employee' && `نجمة الثناء`}
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Center Image Swiper */}
      <div className="w-full flex-1 flex items-center justify-center z-20 pt-4 sm:pt-6 pb-4 min-h-[360px] sm:min-h-[440px]">
        <Swiper
          ref={swiperRef}
          dir="ltr"
          effect={'creative'}
          grabCursor={true}
          allowTouchMove={true}
          rewind={true}
          centeredSlides={true}
          slidesPerView={1}
          autoplay={{ delay: 3000, disableOnInteraction: true }}
          onAutoplayStart={swiper => { if (hasInteracted.current) swiper.autoplay.stop(); }}
          onSlideChange={(swiper) => setActiveIndex(swiper.activeIndex)}
          creativeEffect={{
            limitProgress: 1,
            prev: { translate: ['-110%', 0, -100], opacity: 0, scale: 0.9 },
            next: { translate: ['110%', 0, -100], opacity: 0, scale: 0.9 },
          }}
          modules={[EffectCreative, Autoplay]}
          className="w-full h-full max-w-xs sm:max-w-sm mx-auto"
          style={{ overflow: 'visible' }}
        >
          {slidesData.map((slide, i) => (
            <SwiperSlide key={i} className="flex justify-center items-center" style={{ overflow: 'visible' }}>
              <div className="h-full flex justify-center items-center relative w-full px-4">
                
                {slide.type === 'employee' && (
                  <img src={slide.data.imageUrl} alt={slide.data.name} className="h-[40vh] sm:h-[55vh] max-w-full object-contain drop-shadow-xl" />
                )}

                {slide.type === 'partnership' && (
                  <div className="w-[260px] sm:w-[300px] h-[40vh] sm:h-[50vh] bg-gradient-to-br from-blue-50 to-indigo-100 rounded-[2rem] sm:rounded-[3rem] shadow-xl border-4 border-white flex flex-col justify-center items-center p-4 sm:p-6 text-center gap-2 sm:gap-4 relative overflow-hidden rtl" dir="rtl">
                    <Users size={48} className="text-blue-500 opacity-20 absolute top-6 right-6" />
                    <div className="flex items-center justify-center -space-x-6 sm:-space-x-8 rtl:space-x-reverse mt-2">
                      <img src={slide.emp1.imageUrl} alt={slide.emp1.name} className="w-20 h-20 sm:w-28 sm:h-28 rounded-full border-4 border-white shadow-xl object-cover object-top bg-white z-10" />
                      <img src={slide.emp2.imageUrl} alt={slide.emp2.name} className="w-20 h-20 sm:w-28 sm:h-28 rounded-full border-4 border-white shadow-xl object-cover object-top bg-white z-0 -ml-6 sm:-ml-8" />
                    </div>
                    <div className="z-10 mt-2 sm:mt-4 bg-white/60 backdrop-blur-sm p-3 sm:p-4 rounded-2xl sm:rounded-3xl w-full shadow-sm">
                      <h4 className="text-base sm:text-xl font-black text-gray-800 leading-tight">{slide.emp1.name}</h4>
                      <p className="text-xs font-bold text-gray-500 my-0.5">&</p>
                      <h4 className="text-base sm:text-xl font-black text-gray-800 leading-tight">{slide.emp2.name}</h4>
                    </div>
                  </div>
                )}

                {slide.type === 'active_branch' && (
                  <div className="w-[260px] sm:w-[300px] h-[40vh] sm:h-[50vh] bg-gradient-to-br from-emerald-50 to-teal-100 rounded-[2rem] sm:rounded-[3rem] shadow-xl border-4 border-white flex flex-col justify-center items-center p-4 sm:p-6 text-center gap-2 sm:gap-4 relative overflow-hidden rtl" dir="rtl">
                    <Building2 size={48} className="text-teal-500 opacity-20 absolute top-6 left-6" />
                    <div className="w-24 h-24 sm:w-36 sm:h-36 bg-white rounded-[1.5rem] sm:rounded-[2rem] flex flex-col items-center justify-center shadow-lg border-2 border-teal-50 mb-2 sm:mb-4 rotate-3">
                      <TrendingUp size={32} className="text-teal-500 mb-1" />
                      <p className="text-xl sm:text-3xl font-extrabold text-teal-600">+{slide.count}</p>
                    </div>
                    <h3 className="text-xl sm:text-3xl font-black text-gray-800 leading-tight">{slide.branch}</h3>
                    <p className="text-teal-700 font-bold bg-teal-100 px-3 py-1 sm:px-4 sm:py-2 rounded-full mt-1 text-xs sm:text-sm shadow-inner">في آخر ٤ أيام</p>
                  </div>
                )}

                {slide.type === 'active_employee' && (
                  <div className="w-[260px] sm:w-[300px] h-[40vh] sm:h-[50vh] bg-gradient-to-br from-amber-50 to-orange-100 rounded-[2rem] sm:rounded-[3rem] shadow-xl border-4 border-white flex flex-col justify-center items-center p-4 sm:p-6 text-center relative overflow-hidden rtl" dir="rtl">
                    <Star size={48} className="text-orange-500 opacity-20 absolute top-6 right-6" />
                    <img src={slide.employee.imageUrl} alt={slide.employee.name} className="w-28 h-28 sm:w-40 sm:h-40 rounded-full border-4 border-white shadow-xl object-cover object-top bg-white mb-3 sm:mb-6 z-10" />
                    <h3 className="text-xl sm:text-3xl font-black text-gray-800 leading-tight z-10">{slide.employee.name}</h3>
                    <p className="text-orange-700 font-bold bg-orange-100 px-3 py-1 sm:px-4 sm:py-2 rounded-full mt-2 sm:mt-4 z-10 text-xs sm:text-sm shadow-inner">نشاط متصاعد بقوة</p>
                  </div>
                )}

                {slide.type === 'praised_employee' && (
                  <div className="w-[260px] sm:w-[300px] h-[40vh] sm:h-[50vh] bg-gradient-to-br from-pink-50 to-rose-100 rounded-[2rem] sm:rounded-[3rem] shadow-xl border-4 border-white flex flex-col justify-start items-center p-4 sm:p-6 text-center relative overflow-hidden rtl" dir="rtl">
                    <MessageSquareHeart size={48} className="text-pink-500 opacity-10 absolute bottom-6 left-6" />
                    <img src={slide.employee.imageUrl} alt={slide.employee.name} className="w-16 h-16 sm:w-24 sm:h-24 rounded-full border-4 border-pink-200 shadow-lg object-cover object-top bg-white mb-2 sm:mb-4 z-10 shrink-0" />
                    <h3 className="text-lg sm:text-2xl font-black text-gray-800 leading-tight z-10 shrink-0">{slide.employee.name}</h3>
                    
                    <div className="mt-2 sm:mt-4 flex flex-col gap-2 w-full z-10 overflow-y-auto flex-1">
                      {slide.texts.length > 0 ? slide.texts.map((t, idx) => (
                        <div key={idx} className="bg-white/90 backdrop-blur-sm p-2 sm:p-3 rounded-xl sm:rounded-2xl shadow-sm text-[11px] sm:text-xs text-gray-800 text-right line-clamp-2 italic border border-pink-50 relative">
                          <span className="text-pink-300 text-lg sm:text-2xl absolute -top-1 -right-1 font-serif">"</span>
                          {t}
                        </div>
                      )) : (
                        <div className="bg-white/70 p-3 rounded-xl text-center">
                          <p className="text-pink-600 font-bold text-sm">⭐ {slide.count} تقييم هذا الأسبوع</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

              </div>
            </SwiperSlide>
          ))}
        </Swiper>
      </div>

      {/* Bottom Blue Curved Card */}
      <div className="w-full z-30 pointer-events-none flex flex-col justify-end mt-auto pt-2 pb-[max(2.5rem,calc(env(safe-area-inset-bottom)+2rem))]">
        <svg viewBox="0 0 100 20" preserveAspectRatio="none" className="w-full h-10 sm:h-14 text-blue-500 fill-current block -mb-px">
          <path d="M0,20 Q50,0 100,20 Z" />
        </svg>
        <div className="bg-blue-500 w-full flex flex-col items-center justify-center text-white pointer-events-auto pb-8 sm:pb-6 relative min-h-[200px]">
          
          {/* Left/Right Action Buttons */}
          <button 
            aria-label="جميع الموظفات" onClick={() => { setShowAllEmployeesModal(true); handleModalOpen(); }} 
            className="absolute left-4 sm:left-6 top-6 bg-white/10 p-2.5 sm:p-4 rounded-full hover:bg-white/20 transition-all hover:scale-110 active:scale-95 shadow-lg backdrop-blur-sm z-40"
          >
             <Users size={22} className="text-white" />
          </button>
          <button 
            aria-label="الفروع" onClick={() => { setShowAllBranchesModal(true); handleModalOpen(); }} 
            className="absolute right-4 sm:right-6 top-6 bg-white/10 p-2.5 sm:p-4 rounded-full hover:bg-white/20 transition-all hover:scale-110 active:scale-95 shadow-lg backdrop-blur-sm z-40"
          >
             <Building2 size={22} className="text-white" />
          </button>

          <AnimatePresence mode="wait">
            <motion.div
              key={activeIndex + '-bottom'}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.25 }}
              className="flex flex-col items-center w-full px-4 sm:px-6"
            >
              
              {activeSlide.type === 'employee' && (
                <>
                  <div className="flex items-baseline justify-center gap-2 mb-2 flex-wrap">
                    <EmployeeCard employee={activeSlide.data} onModalOpen={handleModalOpen} onModalClose={handleModalClose}>
                      <button className="text-2xl sm:text-4xl font-bold hover:underline" aria-label={`فتح بيانات ${activeSlide.data.name}`}>{activeSlide.data.name}</button>
                    </EmployeeCard>
                    <button onClick={() => { setManualBranchName(activeSlide.data.branch); setShowBranchModal(true); handleModalOpen(); }} className="text-lg sm:text-2xl font-medium hover:underline" aria-label={`فتح فرع ${activeSlide.data.branch}`}>({activeSlide.data.branch})</button>
                  </div>

                  <div className="flex items-center justify-center gap-6 sm:gap-8 w-full mt-0.5 sm:mt-1">
                    <div className="flex flex-col items-center">
                      <p className="text-blue-100 text-[10px] sm:text-xs font-bold">النقاط</p>
                      <p className="text-xl sm:text-3xl font-extrabold">{activeSlide.data.points.toFixed(1)}</p>
                    </div>
                    <div className="w-px h-8 sm:h-10 bg-blue-300/50"></div>
                    <div className="flex flex-col items-center">
                      <p className="text-blue-100 text-[10px] sm:text-xs font-bold">رصيد الشهر</p>
                      <p className="text-xl sm:text-3xl font-extrabold">{activeSlide.data.monthReviewsCount != null ? (activeSlide.data.monthReviewsCount % 1 === 0 ? activeSlide.data.monthReviewsCount : activeSlide.data.monthReviewsCount.toFixed(1)) : 0} <span className="text-sm sm:text-base font-bold">تقييم</span></p>
                    </div>
                  </div>
                  <p className="text-xs text-blue-100 mt-2">شريكتي المفضلة</p>
                  <h2 className="text-2xl sm:text-4xl font-bold mb-1">{partnerAccount?.name || 'لازلت أعمل على ذلك'}</h2>
                  {partnerAccount && <p className="text-[10px] sm:text-xs text-blue-100 mt-2">اكتسبت مع {partnerAccount.name} {activePartner.count} تقييم خلال هذا الشهر</p>}
                </>
              )}

              {activeSlide.type === 'partnership' && (
                <>
                  <h2 className="text-xl sm:text-4xl font-bold mb-1 sm:mb-3">شراكة فعالة</h2>
                  <button onClick={() => { setShowBranchModal(true); handleModalOpen(); }} className="text-sm sm:text-xl font-medium hover:underline bg-white/20 px-3 sm:px-4 py-0.5 sm:py-1 rounded-full mb-1.5 sm:mb-3">
                    فرع {activeSlide.branch}
                  </button>
                  <div className="flex flex-col items-center mt-1 sm:mt-2">
                    <p className="text-blue-100 text-[10px] sm:text-xs font-bold">التقييمات المشتركة</p>
                    <p className="text-2xl sm:text-4xl font-extrabold">{activeSlide.count}</p>
                  </div>
                </>
              )}

              {activeSlide.type === 'active_branch' && (
                <>
                  <h2 className="text-xl sm:text-4xl font-bold mb-1 sm:mb-3">الفرع الأنشط مؤخراً</h2>
                  <button onClick={() => { setShowBranchModal(true); handleModalOpen(); }} className="text-base sm:text-2xl font-bold hover:underline bg-white/20 px-4 sm:px-6 py-1 sm:py-2 rounded-full mb-1.5 sm:mb-3">
                    {activeSlide.branch}
                  </button>
                  <div className="flex flex-col items-center mt-1 sm:mt-2">
                    <p className="text-blue-100 text-[10px] sm:text-xs font-bold">اكتسب في 4 أيام</p>
                    <p className="text-2xl sm:text-4xl font-extrabold">{activeSlide.count} <span className="text-sm sm:text-lg">تقييم</span></p>
                  </div>
                </>
              )}

              {activeSlide.type === 'active_employee' && (
                <>
                  <h2 className="text-xl sm:text-4xl font-bold mb-1 sm:mb-2">الموظفة الأنشط مؤخراً</h2>
                  <EmployeeCard employee={activeSlide.employee} onModalOpen={handleModalOpen} onModalClose={handleModalClose}>
                    <button className="flex items-center gap-2 hover:scale-105 transition-transform group my-1 sm:my-2">
                      <h3 className="text-lg sm:text-2xl font-extrabold underline decoration-white/30 underline-offset-4">{activeSlide.employee.name}</h3>
                    </button>
                  </EmployeeCard>
                  <button onClick={() => { setShowBranchModal(true); handleModalOpen(); }} className="text-xs sm:text-base font-medium hover:underline bg-white/20 px-3 py-0.5 sm:py-1 rounded-full mb-1.5 sm:mb-3">
                    {activeSlide.employee.branch}
                  </button>
                  <div className="flex flex-col items-center">
                    <p className="text-blue-100 text-[10px] sm:text-xs font-bold">اكتسبت في 4 أيام</p>
                    <p className="text-2xl sm:text-4xl font-extrabold">{activeSlide.count} <span className="text-sm sm:text-lg">تقييم</span></p>
                  </div>
                </>
              )}

              {activeSlide.type === 'praised_employee' && (
                <>
                  <h2 className="text-xl sm:text-4xl font-bold mb-1 sm:mb-2 text-pink-100">نجمة الثناء</h2>
                  <EmployeeCard employee={activeSlide.employee} onModalOpen={handleModalOpen} onModalClose={handleModalClose}>
                    <button className="flex items-center gap-2 hover:scale-105 transition-transform group my-1 sm:my-2">
                      <h3 className="text-lg sm:text-2xl font-extrabold underline decoration-white/30 underline-offset-4">{activeSlide.employee.name}</h3>
                    </button>
                  </EmployeeCard>
                  <button onClick={() => { setShowBranchModal(true); handleModalOpen(); }} className="text-xs sm:text-base font-medium hover:underline bg-white/20 px-3 py-0.5 sm:py-1 rounded-full mb-1.5 sm:mb-3">
                    {activeSlide.employee.branch}
                  </button>
                  <div className="flex flex-col items-center">
                    <p className="text-blue-100 text-[10px] sm:text-xs font-bold">تقييمات هذا الأسبوع</p>
                    <p className="text-2xl sm:text-4xl font-extrabold text-pink-100">{activeSlide.count} <span className="text-sm sm:text-lg">تقييم</span></p>
                  </div>
                </>
              )}

            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* All Employees Modal */}
      <AnimatePresence>
        {showAllEmployeesModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 font-alexandria touch-auto" dir="rtl">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => { setShowAllEmployeesModal(false); handleModalClose(); }}
            />
            <motion.div 
              initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }}
              className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
            >
              <div className="bg-blue-600 p-4 text-white flex justify-between items-center shrink-0">
                <h3 className="text-xl font-bold flex items-center gap-2"><Users size={24} /> جميع الموظفات</h3>
                <button 
                  onClick={() => { setShowAllEmployeesModal(false); handleModalClose(); }}
                  className="p-2 bg-blue-500/50 hover:bg-blue-500 rounded-full"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="p-4 bg-gray-50 overflow-y-auto flex-1 space-y-3">
                {allEmployeesSorted.map((emp, idx) => (
                  <EmployeeCard key={emp.id} employee={emp} onModalOpen={handleModalOpen} onModalClose={handleModalClose}>
                    <button className="w-full bg-white p-3 rounded-xl border shadow-sm flex items-center gap-4 hover:bg-gray-50 transition-colors text-right">
                      <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold shrink-0">{idx + 1}</div>
                      <img src={emp.imageUrl} alt={emp.name} className="w-12 h-12 rounded-full object-cover object-top border-2 border-gray-100 shrink-0" />
                      <div className="flex-1">
                        <h4 className="font-bold text-gray-800">{emp.name}</h4>
                        <p className="text-xs text-gray-500">{emp.branch}</p>
                      </div>
                      <div className="text-center shrink-0">
                        <p className="text-lg font-black text-blue-600">{emp.monthReviewsCount != null ? (emp.monthReviewsCount % 1 === 0 ? emp.monthReviewsCount : emp.monthReviewsCount.toFixed(1)) : 0}</p>
                        <p className="text-[10px] text-gray-400">رصيد الشهر</p>
                      </div>
                    </button>
                  </EmployeeCard>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* All Branches Modal */}
      <AnimatePresence>
        {showAllBranchesModal && (() => {
          const branches = ['جاليري', 'ذافيو', 'سلام', 'القصر', 'المملكة', 'شرق'];
          
          return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 font-alexandria touch-auto" dir="rtl">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => { setShowAllBranchesModal(false); handleModalClose(); }}
            />
            <motion.div 
              initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }}
              className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
            >
              <div className="bg-blue-600 p-4 text-white flex justify-between items-center shrink-0">
                <h3 className="text-xl font-bold flex items-center gap-2"><Building2 size={24} /> الفروع</h3>
                <button 
                  onClick={() => { setShowAllBranchesModal(false); handleModalClose(); }}
                  className="p-2 bg-blue-500/50 hover:bg-blue-500 rounded-full"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="p-4 bg-gray-50 overflow-y-auto flex-1 space-y-4">
                {syncError ? <p role="alert" className="text-red-700">{syncError}</p> : !recordsReady && <p role="status">جارٍ تحميل بيانات الفروع…</p>}
                {recordsReady && branches.map(branchName => {
                  const branchMonthReviews = reviews.filter(review => review.branch === branchName && isInCurrentMonth(review.date));
                  const branchMonthPositiveReviews = branchMonthReviews.filter(review => isPositiveReview(review.rating));

                  const empPositiveReviewCounts: Record<string, number> = {};
                  branchMonthPositiveReviews.forEach(r => {
                    r.linkedEmployeeIds.forEach(id => {
                      empPositiveReviewCounts[id] = (empPositiveReviewCounts[id] || 0) + 1;
                    });
                  });

                  const branchEmps = users.filter(u => u.branch === branchName && u.role === 'employee');
                  const top2 = branchEmps.sort((a, b) => (empPositiveReviewCounts[b.id] || 0) - (empPositiveReviewCounts[a.id] || 0)).slice(0, 2);

                  return (
                    <div 
                      key={branchName} 
                      className="bg-white p-4 rounded-xl border shadow-sm cursor-pointer hover:border-blue-300 transition-colors relative"
                      onClick={() => {
                        setShowAllBranchesModal(false);
                        setManualBranchName(branchName);
                        setBranchModalSelectedDate(null);
                        setShowBranchModal(true);
                      }}
                    >
                      <div className="flex justify-between items-center mb-3 border-b pb-2">
                        <h4 className="font-bold text-lg text-blue-800">{branchName}</h4>
                        <div className="text-left">
                          <p className="text-xs text-gray-500">إجمالي تقييمات الشهر</p>
                          <p className="text-xl font-black text-blue-600">{branchMonthReviews.length}</p>
                        </div>
                      </div>
                      
                      <p className="text-sm text-gray-600 font-bold mb-2 mt-2">أكثر الموظفات تفاعلاً:</p>
                      {top2.length > 0 ? (
                        <div className="grid grid-cols-2 gap-2 relative z-10">
                          {top2.map(emp => (
                            <div key={emp.id} className="w-full flex items-center gap-2 text-right">
                              <img src={emp.imageUrl} alt={emp.name} className="w-8 h-8 rounded-full object-cover object-top border shrink-0" />
                              <div className="overflow-hidden flex-1">
                                <p className="text-xs font-bold text-gray-800 truncate">{emp.name}</p>
                                <p className="text-[10px] text-blue-600 font-bold">{empPositiveReviewCounts[emp.id] || 0} التقييمات</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400">لا يوجد موظفات مسجلات</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </div>
          );
        })()}
      </AnimatePresence>

      {/* Branch Modal (from slide) */}
      {(() => {
        if (!modalBranchName) return null;
        const branchStart = branchSettings[modalBranchName]?.start || '16:00';
        
        const branchReviews = reviews.filter(r => r.branch === modalBranchName && isInCurrentMonth(r.date)).map(r => ({
           ...r,
           businessDate: getBusinessDate(r.date, r.time, branchStart)
        }));
        
        const reviewCountsByDate: Record<string, number> = {};
        branchReviews.forEach(r => {
           reviewCountsByDate[r.businessDate] = (reviewCountsByDate[r.businessDate] || 0) + 1;
        });
        const maxDailyReviews = Math.max(0, ...Object.values(reviewCountsByDate));

        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();
        const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
        const firstDayOfWeek = new Date(currentYear, currentMonth, 1).getDay();
        
        const calendarCells = [];
        for(let i = 0; i < firstDayOfWeek; i++) calendarCells.push(null);
        for(let d = 1; d <= daysInMonth; d++) calendarCells.push(d);

        let shiningStar = { name: 'لا يوجد', count: 0 };
        let bestPartnership = { names: 'لا يوجد', count: 0 };
        const empCounts: Record<string, number> = {};
        const pairCounts: Record<string, number> = {};

        if (branchReviews.length > 0 && showBranchModal) {

          branchReviews.forEach(r => {
            r.linkedEmployeeIds.forEach(id => {
              empCounts[id] = (empCounts[id] || 0) + 1;
            });
            if (r.linkedEmployeeIds.length > 1) {
              for (let i = 0; i < r.linkedEmployeeIds.length; i++) {
                for (let j = i + 1; j < r.linkedEmployeeIds.length; j++) {
                  const pair = [r.linkedEmployeeIds[i], r.linkedEmployeeIds[j]].sort().join('|');
                  pairCounts[pair] = (pairCounts[pair] || 0) + 1;
                }
              }
            }
          });

          let maxEmpCount = 0;
          Object.entries(empCounts).forEach(([id, count]) => {
            if (count > maxEmpCount) {
              maxEmpCount = count;
              shiningStar = { name: users.find(u => u.id === id)?.name || 'غير معروف', count };
            }
          });

          let maxPairCount = 0;
          Object.entries(pairCounts).forEach(([pair, count]) => {
            if (count > maxPairCount) {
              maxPairCount = count;
              const [id1, id2] = pair.split('|');
              const name1 = users.find(u => u.id === id1)?.name || '';
              const name2 = users.find(u => u.id === id2)?.name || '';
              bestPartnership = { names: `${name1} و ${name2}`, count };
            }
          });
        }

        return (
          <AnimatePresence>
            {showBranchModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 font-alexandria touch-auto" dir="rtl">
                <motion.div 
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                  onClick={() => { setShowBranchModal(false); setManualBranchName(null); setBranchModalSelectedDate(null); handleModalClose(); }}
                />
                <motion.div 
                  initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }}
                  className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] md:max-h-[85vh]"
                >
                  <div className="bg-blue-600 p-4 text-white flex justify-between items-center shrink-0">
                    <h3 className="text-xl font-bold">{modalBranchName}</h3>
                    <button 
                      onClick={() => { setShowBranchModal(false); setManualBranchName(null); setBranchModalSelectedDate(null); handleModalClose(); }}
                      className="p-2 bg-blue-500/50 hover:bg-blue-500 rounded-full"
                    >
                      <X size={20} />
                    </button>
                  </div>

                  {/* Employees List */}
                  <div className="p-3 border-b border-gray-100 shrink-0">
                     <div className="flex flex-wrap justify-center gap-1.5">
                       {users.filter(u => u.branch === modalBranchName && u.role === 'employee').map(emp => (
                         <div 
                           key={emp.id}
                           className="px-3 py-1 rounded-full text-[10px] sm:text-xs font-bold text-blue-900 bg-transparent border border-blue-100 shadow-[0_0_6px_rgba(59,130,246,0.2)]"
                         >
                           {emp.name}
                         </div>
                       ))}
                     </div>
                  </div>

                  {/* Visual Data (Calendar Heatmap) */}
                  <div className="p-4 bg-gray-50 border-b border-gray-100 shrink-0">
                     <p className="text-sm font-bold text-gray-700 mb-3">تقييمات الشهر الحالي (الخريطة الحرارية):</p>
                     
                     <div className="max-w-[280px] mx-auto">
                       <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-2 text-center text-[10px] text-gray-400 font-bold">
                         <div>أحد</div><div>إثنين</div><div>ثلاثاء</div><div>أربعاء</div><div>خميس</div><div>جمعة</div><div>سبت</div>
                       </div>
                       <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
                         {calendarCells.map((day, idx) => {
                           if (!day) return <div key={`empty-${idx}`} className="w-full aspect-square"></div>;
                           
                           const dateStr = `${String(day).padStart(2, '0')}-${String(currentMonth + 1).padStart(2, '0')}-${currentYear}`;
                           const count = reviewCountsByDate[dateStr] || 0;
                           
                           // Calculate shade of blue
                           let bgClass = "bg-transparent text-gray-400";
                           if (count > 0) {
                             const ratio = count / (maxDailyReviews || 1);
                             if (ratio > 0.8) bgClass = "bg-blue-700 text-white shadow-sm";
                             else if (ratio > 0.5) bgClass = "bg-blue-500 text-white shadow-sm";
                             else if (ratio > 0.2) bgClass = "bg-blue-400 text-white shadow-sm";
                             else bgClass = "bg-blue-200 text-blue-900 shadow-sm";
                           }

                           const isSelected = branchModalSelectedDate === dateStr;

                           return (
                             <button 
                               key={day}
                               onClick={() => setBranchModalSelectedDate(isSelected ? null : dateStr)}
                               className={`w-full aspect-square flex items-center justify-center rounded-md transition-all ${bgClass} ${isSelected ? 'ring-2 ring-offset-1 ring-blue-600 scale-105 shadow-md z-10 relative' : 'hover:opacity-80'}`}
                             >
                               <span className="text-[10px] font-bold">{day}</span>
                             </button>
                           );
                         })}
                       </div>
                       <div className="mt-4 flex justify-between items-center text-[9px] text-gray-400 font-bold px-2">
                         <span>أقل تفاعلاً</span>
                         <div className="flex-1 mx-3 h-1.5 bg-gradient-to-l from-blue-700 via-blue-400 to-transparent border border-gray-100 rounded-full"></div>
                         <span>ذروة التفاعل</span>
                       </div>
                     </div>
                  </div>

                  {branchModalSelectedDate && (
                    <div className="bg-blue-50 p-4 border-b border-blue-100 shadow-inner shrink-0">
                       <p className="text-xs font-bold text-blue-800 mb-2">الفريق المداوم في {formatDate(branchModalSelectedDate)}:</p>
                       <div className="flex flex-wrap gap-2">
                         {(() => {
                           const dayShifts = timeline.filter(t => t.branch === modalBranchName && t.type === 'shift' && t.date === branchModalSelectedDate);
                           const empIds = new Set<string>();
                           dayShifts.forEach(s => s.employees?.forEach(e => empIds.add(e.id)));
                           const emps = users.filter(u => empIds.has(u.id));
                           
                           if (emps.length === 0) return <p className="text-xs text-gray-500">{currentAccount?.role === 'admin' || (currentAccount?.role === 'manager' && currentAccount.branch === modalBranchName) ? 'لا توجد شفتات مسجلة.' : 'لا توجد شفتات متاحة ضمن صلاحيات حسابك لهذا اليوم.'}</p>;
                           
                           return emps.map(emp => (
                             <div key={emp.id} className="flex items-center gap-1 bg-white px-2 py-1 rounded-full border border-blue-100 text-xs text-blue-700 font-bold shadow-sm">
                               <img src={emp.imageUrl} alt={emp.name} className="w-5 h-5 rounded-full object-cover object-top" />
                               {emp.name}
                             </div>
                           ));
                         })()}
                       </div>
                    </div>
                  )}

                  <div className="bg-white p-4 border-b border-blue-100 grid grid-cols-3 gap-2 text-center shrink-0">
                    <div className="bg-gray-50 rounded-xl p-2 shadow-sm border border-blue-100 flex flex-col justify-center">
                      <p className="text-[10px] sm:text-xs text-blue-600 font-bold mb-1">تقييمات الشهر</p>
                      <p className="text-lg sm:text-xl font-extrabold">{branchReviews.length}</p>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-2 shadow-sm border border-yellow-100 flex flex-col justify-center">
                      <p className="text-[10px] sm:text-xs text-yellow-600 font-bold mb-1">المتألقة</p>
                      <p className="text-xs sm:text-sm font-bold truncate">{shiningStar.name}</p>
                      <p className="text-[9px] sm:text-[10px] text-gray-400 mt-1">{shiningStar.count} تقييم</p>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-2 shadow-sm border border-green-100 flex flex-col justify-center">
                      <p className="text-[10px] sm:text-xs text-green-600 font-bold mb-1">شراكة فعالة</p>
                      <p className="text-[10px] sm:text-[11px] font-bold leading-tight">{bestPartnership.names}</p>
                      <p className="text-[9px] sm:text-[10px] text-gray-400 mt-1">{bestPartnership.count} مشترك</p>
                    </div>
                  </div>

                  <div className="p-4 bg-gray-50 overflow-y-auto flex-1 min-h-0 space-y-3">
                    {(branchModalSelectedDate 
                      ? branchReviews.filter(r => r.businessDate === branchModalSelectedDate)
                      : branchReviews
                    ).map(r => (
                      <div key={r.id} className="bg-white p-4 rounded-xl border shadow-sm relative">
                        <div className="flex justify-between items-start">
                          <div className="flex text-yellow-400 mb-2">★★★★★</div>
                          <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-1 rounded">
                            {formatDateTime(r.date, r.time)}
                          </span>
                        </div>
                        <p className="text-gray-700 text-sm">{r.comment || (privateReviews.some(review => review.id === r.id) ? 'تقييم بدون تعليق' : `تقييم ${r.rating} نجوم في فرع ${r.branch}، مرتبط بـ ${r.linkedEmployeeIds.length} من الموظفات.`)}</p>
                        <p className="text-xs text-green-700 font-bold mt-2">
                          {r.linkedEmployeeIds && r.linkedEmployeeIds.length > 0 
                            ? `الموظفات: ${r.linkedEmployeeIds.map(id => users.find(u => u.id === id)?.name).join('، ')}`
                            : 'غير مرتبط'}
                        </p>
                      </div>
                    ))}
                    {branchReviews.length === 0 && (
                      <p className="text-center text-gray-500 py-10">لا توجد تقييمات لهذا الفرع.</p>
                    )}
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        );
      })()}
    </div>
  );
};
