import { praiseCycle, nextPraiseCycle, praisedEmployee } from '../lib/praisedEmployee';
import { EmployeeIdentity } from '../components/EmployeeIdentity';
import { gemTheme } from '../lib/gems';
import { employeeTier } from '../lib/employeeFeatures';
import type { SceneryHandle } from '../components/LeaderboardScenery';
import { LeaderboardScenery } from '../components/LeaderboardScenery';
import { EmployeeAvatar, BalanceGrowth, Overtaken } from '../components/EmployeeFeatures';
import { BrandName, PageLoading } from '../components/Brand';
import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Autoplay } from 'swiper/modules';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { X, Building2, Users, MessageSquareHeart, TrendingUp, UserRound, ChevronLeft, ChevronRight } from 'lucide-react';
import 'swiper/css';
import { EmployeeCard } from '../components/EmployeeCard';
import { useData } from '../context/DataContext';
import { ActivityChart } from '../components/ActivityChart';
import { isWithinLastDays } from '../lib/formatDate';
import type { UserAccount } from '../lib/mockData';
import { isInCurrentMonth, isPositiveReview } from '../lib/reviewPeriod';
import { favoritePartner, newestFirst, monthlyEmployeeOrder } from '../lib/employeeActivity';

type SlideData = 
  | { type: 'employee'; data: UserAccount; rank: number }
  | { type: 'partnership'; branch: string; emp1: UserAccount; emp2: UserAccount; count: number }
  | { type: 'active_branch'; branch: string; count: number }
  | { type: 'active_employee'; employee: UserAccount; count: number }
  | { type: 'praised_employee'; employee: UserAccount; count: number };

export const Leaderboard: React.FC = () => {
  const reduceMotion = useReducedMotion();
  const { users, reviewSummaries, summaryReady, syncError, features } = useData();
  const reviews = useMemo(() => [...reviewSummaries].sort(newestFirst), [reviewSummaries]);
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [showAllEmployeesModal, setShowAllEmployeesModal] = useState(false);
  const [showAllBranchesModal, setShowAllBranchesModal] = useState(false);
  const [manualBranchName, setManualBranchName] = useState<string | null>(null);
  
  const allEmployeesSorted = useMemo(() => {
    return users.filter(u => u.role === 'employee').sort(monthlyEmployeeOrder);
  }, [users]);

  const [praisePeriod, setPraisePeriod] = useState(() => praiseCycle());
  useEffect(() => {
    const timer = window.setTimeout(() => setPraisePeriod(praiseCycle()), Math.max(0, nextPraiseCycle(praisePeriod) - Date.now()) + 50);
    return () => window.clearTimeout(timer);
  }, [praisePeriod]);

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

    const praise = praisedEmployee(reviews, allEmployeesSorted, praisePeriod);
    const mostPraisedEmployee = users.find(employee => employee.id === praise.id);
    if (mostPraisedEmployee && praise.count > 0) {
      sData.push({ type: 'praised_employee', employee: mostPraisedEmployee, count: praise.count });
    }

    const order = { praised_employee: 0, active_employee: 1, active_branch: 2, employee: 3, partnership: 4 };
    return sData.sort((a, b) => order[a.type] - order[b.type] || (a.type === 'employee' && b.type === 'employee' ? a.rank - b.rank : a.type === 'partnership' && b.type === 'partnership' ? b.count - a.count : 0));
  }, [allEmployeesSorted, users, reviews, praisePeriod]);

  const [activeIndex, setActiveIndex] = useState(0);
  const activeSlide = slidesData[activeIndex] || slidesData[0];
  
  const modalBranchName = manualBranchName || (activeSlide?.type === 'employee' ? activeSlide.data.branch 
    : activeSlide?.type === 'partnership' ? activeSlide.branch 
    : activeSlide?.type === 'active_branch' ? activeSlide.branch 
    : undefined);
  const swiperRef = useRef<any>(null);
  const sceneryRef = useRef<SceneryHandle>(null);
  const sceneryDuration = useRef(0);
  const goldSlides = useMemo(() => slidesData.map(slide => {
    const employee = slide.type === 'employee' ? slide.data : slide.type === 'active_employee' || slide.type === 'praised_employee' ? slide.employee : null;
    return Boolean(employee && features && employeeTier(employee.points, features.settings) === 'gold');
  }), [slidesData, features]);
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

  if (!summaryReady) return <PageLoading error={syncError} />;
  if (slidesData.length === 0) return <div className="p-8 text-center" dir="rtl">{syncError || 'لا توجد نتائج لعرضها بعد.'}</div>;

  return (
    <div 
      data-gem-theme={activeSlide.type === 'employee' ? gemTheme(features?.store?.magic, activeSlide.data.id) : undefined}
      data-tier={activeSlide.type === 'employee' && features ? employeeTier(activeSlide.data.points, features.settings) : 'bronze'}
      className="recognition-page w-full min-w-0 min-h-[100svh] overflow-x-clip overscroll-y-contain flex flex-col justify-between items-center relative font-alexandria touch-pan-y"
      dir="rtl"
      onPointerDownCapture={handleTouchStart}
      onTouchStartCapture={handleTouchStart}
      onKeyDownCapture={handleTouchStart}
    >
      
      <LeaderboardScenery ref={sceneryRef} goldSlides={goldSlides} reduceMotion={Boolean(reduceMotion)} />
      <header className="recognition-header relative z-30"><BrandName /><Link to="/dashboard" className="inline-flex min-h-9 items-center gap-1 rounded-xl bg-blue-50 px-3 py-2 text-xs text-blue-700" aria-label="صفحتي الخاصة"><UserRound size={16} aria-hidden="true" />صفحتي</Link></header>
      <div className="absolute inset-x-3 top-[38%] sm:top-[42%] z-40 hidden md:flex justify-between pointer-events-none" aria-label="تقليب البطاقات">
        <button aria-label="البطاقة السابقة" onClick={() => { handleTouchStart(); swiperRef.current?.swiper?.slidePrev(); }} className="pointer-events-auto rounded-full bg-white/80 border p-2 text-blue-600 shadow"><ChevronRight size={22}/></button>
        <button aria-label="البطاقة التالية" onClick={() => { handleTouchStart(); swiperRef.current?.swiper?.slideNext(); }} className="pointer-events-auto rounded-full bg-white/80 border p-2 text-blue-600 shadow"><ChevronLeft size={22}/></button>
      </div>
      {/* Top Header - Contextual */}
      <AnimatePresence mode="wait">
        <motion.div 
          key={activeIndex + '-header'}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : 0.15 }}
          className="w-full px-4 sm:px-8 pt-3 flex justify-end items-start z-10 font-bold text-gray-800"
        >
          <div className="text-3xl sm:text-5xl font-extrabold tracking-tight" dir="rtl">
            {activeSlide.type === 'employee' && <>
              <p>{rankNames[activeSlide.rank - 1] || activeSlide.rank}</p><Overtaken employee={activeSlide.data} />

            </>}
            {activeSlide.type === 'partnership' && `شراكات الفروع`}
            {activeSlide.type === 'active_branch' && `إحصائية الأسبوع`}
            {activeSlide.type === 'active_employee' && `نشاط الأسبوع`}
            {activeSlide.type === 'praised_employee' && `نجمة الثناء`}
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Center Image Swiper */}
      <div className="w-full flex-1 flex items-center justify-center z-20 pt-2 sm:pt-6 pb-3 min-h-0 sm:min-h-[440px]">
        <Swiper
          ref={swiperRef}
          dir="ltr"
          grabCursor={true}
          allowTouchMove={true}
          rewind={true}
          centeredSlides={true}
          slidesPerView={1}
          autoplay={reduceMotion ? false : { delay: 5000, disableOnInteraction: true }}
          speed={reduceMotion ? 0 : 280}
          onAutoplayStart={swiper => { if (hasInteracted.current) swiper.autoplay.stop(); }}
          onSlideChange={(swiper) => setActiveIndex(swiper.activeIndex)}
          onSetTransition={(_swiper, duration) => { sceneryDuration.current = duration; }}
          onSetTranslate={swiper => { if (swiper.width) sceneryRef.current?.move(-swiper.translate / swiper.width, sceneryDuration.current); }}
          modules={[Autoplay]}
          className="w-full min-w-0 max-w-xs sm:max-w-sm mx-auto"
          style={{ overflow: 'hidden' }}
        >
          {slidesData.map((slide, i) => (
            <SwiperSlide key={i} className="flex justify-center items-center" style={{ overflow: 'hidden' }}>
              <div className="h-full flex justify-center items-center relative w-full px-4">
                
                {slide.type === 'employee' && (
                  <EmployeeAvatar employee={slide.data} className="h-[clamp(180px,38svh,420px)] sm:h-[55vh] w-full max-w-full drop-shadow-xl" />
                )}

                {slide.type === 'partnership' && (
                  <div className="w-[260px] max-w-full sm:w-[300px] h-[clamp(240px,38svh,360px)] sm:h-[50vh] bg-gradient-to-br from-blue-50 to-indigo-100 rounded-[2rem] sm:rounded-[3rem] shadow-xl border-4 border-white flex flex-col justify-center items-center p-4 sm:p-6 text-center gap-2 sm:gap-4 relative overflow-hidden rtl" dir="rtl">
                    <Users size={48} className="text-blue-500 opacity-20 absolute top-6 right-6" />
                    <div className="flex items-center justify-center -space-x-6 sm:-space-x-8 rtl:space-x-reverse mt-2">
                      <EmployeeAvatar employee={slide.emp1} className="w-20 h-20 sm:w-28 sm:h-28 rounded-full border-4 border-white shadow-xl bg-white z-10" />
                      <EmployeeAvatar employee={slide.emp2} className="w-20 h-20 sm:w-28 sm:h-28 rounded-full border-4 border-white shadow-xl bg-white z-0 -ml-6 sm:-ml-8" />
                    </div>
                    <div className="z-10 mt-2 sm:mt-4 bg-white/60 backdrop-blur-sm p-3 sm:p-4 rounded-2xl sm:rounded-3xl w-full shadow-sm">
                      <h4 className="text-base sm:text-xl font-black text-gray-800 leading-tight">{slide.emp1.name}</h4>
                      <p className="text-xs font-bold text-gray-500 my-0.5">&</p>
                      <h4 className="text-base sm:text-xl font-black text-gray-800 leading-tight">{slide.emp2.name}</h4>
                    </div>
                  </div>
                )}

                {slide.type === 'active_branch' && (
                  <div className="w-[260px] max-w-full sm:w-[300px] h-[clamp(240px,38svh,360px)] sm:h-[50vh] bg-gradient-to-br from-emerald-50 to-teal-100 rounded-[2rem] sm:rounded-[3rem] shadow-xl border-4 border-white flex flex-col justify-center items-center p-4 sm:p-6 text-center gap-2 sm:gap-4 relative overflow-hidden rtl" dir="rtl">
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
                  <div className="w-[260px] max-w-full sm:w-[300px] h-[clamp(240px,38svh,360px)] sm:h-[50vh] bg-gradient-to-br from-emerald-50 to-green-100 rounded-[2rem] sm:rounded-[3rem] shadow-xl border-4 border-white flex flex-col justify-center items-center p-4 sm:p-6 text-center relative overflow-hidden rtl" dir="rtl">
                    <TrendingUp size={48} className="text-emerald-600 opacity-70 absolute top-6 right-6" />
                    <EmployeeAvatar employee={slide.employee} className="w-28 h-28 sm:w-40 sm:h-40 rounded-full border-4 border-white shadow-xl bg-white mb-3 sm:mb-6 z-10" />
                    <h3 className="text-xl sm:text-3xl font-black text-emerald-950 leading-tight z-10">{slide.employee.name}</h3>
                    <p className="text-emerald-900 font-bold bg-emerald-100 px-3 py-1 sm:px-4 sm:py-2 rounded-full mt-2 sm:mt-4 z-10 text-xs sm:text-sm shadow-inner">نشاط متصاعد بقوة</p>
                  </div>
                )}

                {slide.type === 'praised_employee' && (
                  <div className="w-[260px] max-w-full sm:w-[300px] h-[clamp(240px,38svh,360px)] sm:h-[50vh] bg-gradient-to-br from-pink-50 to-rose-100 rounded-[2rem] sm:rounded-[3rem] shadow-xl border-4 border-white flex flex-col justify-center items-center p-4 sm:p-6 text-center relative overflow-hidden rtl" dir="rtl">
                    <MessageSquareHeart size={48} className="text-rose-500 opacity-30 absolute top-6 right-6" />
                    <EmployeeAvatar employee={slide.employee} className="w-28 h-28 sm:w-40 sm:h-40 rounded-full border-4 border-white shadow-xl bg-white mb-3 sm:mb-6 z-10" />
                    <h3 className="text-xl sm:text-3xl font-black text-rose-950 leading-tight z-10 break-words max-w-full">{slide.employee.name}</h3>
                    <p className="text-rose-900 font-bold bg-rose-100 px-3 py-1 sm:px-4 sm:py-2 rounded-full mt-2 sm:mt-4 z-10 text-xs sm:text-sm">نجمة الثناء</p>
                  </div>
                )}

              </div>
            </SwiperSlide>
          ))}
        </Swiper>
      </div>

      {/* White results panel */}
      <div className="w-full shrink-0 z-30 pointer-events-none flex flex-col justify-end mt-auto pt-2 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="recognition-panel w-full flex flex-col items-center justify-center text-slate-900 pointer-events-auto pb-3 sm:pb-6 relative min-h-[160px]">
          
          {/* Left/Right Action Buttons */}
          <button 
            aria-label="جميع الموظفات" onClick={() => { setShowAllEmployeesModal(true); handleModalOpen(); }} 
            className="absolute left-4 sm:left-6 top-6 bg-slate-100 text-slate-700 p-2.5 sm:p-4 rounded-full hover:bg-white/20 transition-all hover:scale-110 active:scale-95 shadow-lg backdrop-blur-sm z-40"
          >
             <Users size={22} className="text-slate-700" />
          </button>
          <button 
            aria-label="الفروع" onClick={() => { setShowAllBranchesModal(true); handleModalOpen(); }} 
            className="absolute right-4 sm:right-6 top-6 bg-slate-100 text-slate-700 p-2.5 sm:p-4 rounded-full hover:bg-white/20 transition-all hover:scale-110 active:scale-95 shadow-lg backdrop-blur-sm z-40"
          >
             <Building2 size={22} className="text-slate-700" />
          </button>

          <AnimatePresence mode="wait">
            <motion.div
              key={activeIndex + '-bottom'}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: reduceMotion ? 0 : 0.15 }}
              className="flex flex-col items-center w-full px-4 sm:px-6"
            >
              
              {activeSlide.type === 'employee' && (
                <>
                  <EmployeeIdentity employee={activeSlide.data} className="items-center mb-3" nameContent={<EmployeeCard employee={activeSlide.data} onModalOpen={handleModalOpen} onModalClose={handleModalClose}><button className="employee-tier-name text-2xl sm:text-4xl font-bold hover:underline" data-tier={features ? employeeTier(activeSlide.data.points, features.settings) : 'bronze'} aria-label={`فتح بيانات ${activeSlide.data.name}`}>{activeSlide.data.name}</button></EmployeeCard>} branchContent={<button onClick={() => { setManualBranchName(activeSlide.data.branch); setShowBranchModal(true); handleModalOpen(); }} className="text-lg sm:text-2xl font-medium hover:underline" aria-label={`فتح فرع ${activeSlide.data.branch}`}>({activeSlide.data.branch})</button>}/>

                  <div className="flex items-center justify-center gap-6 sm:gap-8 w-full mt-0.5 sm:mt-1">
                    <div className="flex flex-col items-center">
                      <p className="text-blue-100 text-[10px] sm:text-xs font-bold">النقاط</p>
                      <p className="text-xl sm:text-3xl font-extrabold">{activeSlide.data.points.toFixed(1)}</p>
                    </div>
                    <div className="w-px h-8 sm:h-10 bg-slate-200"></div>
                    <div className="flex flex-col items-center">
                      <p className="text-blue-100 text-[10px] sm:text-xs font-bold">رصيد الشهر</p>
                      <p className="text-xl sm:text-3xl font-extrabold">{activeSlide.data.monthReviewsCount != null ? (activeSlide.data.monthReviewsCount % 1 === 0 ? activeSlide.data.monthReviewsCount : activeSlide.data.monthReviewsCount.toFixed(1)) : 0} <span className="text-sm sm:text-base font-bold">تقييم</span> <BalanceGrowth employee={activeSlide.data} /></p>
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
                  <h2 className="text-xl sm:text-4xl font-bold mb-1 sm:mb-2 text-emerald-950">الموظفة الأنشط مؤخراً</h2>
                  <EmployeeIdentity employee={activeSlide.employee} className="items-center my-2 text-emerald-950" nameContent={<EmployeeCard employee={activeSlide.employee} onModalOpen={handleModalOpen} onModalClose={handleModalClose}><button className="text-lg sm:text-2xl font-extrabold hover:underline">{activeSlide.employee.name}</button></EmployeeCard>} branchContent={<button onClick={() => { setManualBranchName(activeSlide.employee.branch); setShowBranchModal(true); handleModalOpen(); }} className="hover:underline">({activeSlide.employee.branch})</button>}/>

                  <div className="flex flex-col items-center">
                    <p className="text-emerald-800 text-[10px] sm:text-xs font-bold">اكتسبت في 4 أيام</p>
                    <p className="text-2xl sm:text-4xl font-extrabold text-emerald-950">{activeSlide.count} <span className="text-sm sm:text-lg">تقييم</span></p>
                  </div>
                </>
              )}

              {activeSlide.type === 'praised_employee' && (
                <>
                  <h2 className="text-xl sm:text-4xl font-bold mb-1 sm:mb-2 text-rose-950">نجمة الثناء</h2>
                  <EmployeeIdentity employee={activeSlide.employee} className="items-center my-2" nameContent={<EmployeeCard employee={activeSlide.employee} onModalOpen={handleModalOpen} onModalClose={handleModalClose}><button className="text-lg sm:text-2xl font-extrabold hover:underline">{activeSlide.employee.name}</button></EmployeeCard>} branchContent={<button onClick={() => { setManualBranchName(activeSlide.employee.branch); setShowBranchModal(true); handleModalOpen(); }} className="hover:underline">({activeSlide.employee.branch})</button>}/>

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
              <div className="bg-teal-700 p-4 text-white flex justify-between items-center shrink-0">
                <h3 className="text-xl font-bold flex items-center gap-2"><Users size={24} /> جميع الموظفات</h3>
                <button 
                  onClick={() => { setShowAllEmployeesModal(false); handleModalClose(); }}
                  aria-label="إغلاق نشاط الفرع"
                      className="p-2 bg-teal-600/50 hover:bg-teal-600 rounded-full"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="p-4 bg-gray-50 overflow-y-auto flex-1 space-y-3">
                {allEmployeesSorted.map((emp, idx) => (
                  <EmployeeCard key={emp.id} employee={emp} onModalOpen={handleModalOpen} onModalClose={handleModalClose}>
                    <button className="w-full bg-white p-3 rounded-xl border shadow-sm flex items-center gap-4 hover:bg-gray-50 transition-colors text-right">
                      <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold shrink-0">{idx + 1}</div>
                      <EmployeeAvatar employee={emp} className="w-12 h-12 rounded-full border-2 border-gray-100 shrink-0" />
                      <div className="flex-1 min-w-0 space-y-1">
                        <EmployeeIdentity employee={emp} className="text-gray-800"/>
                        <Overtaken employee={emp} />
                      </div>
                      <div className="text-center shrink-0">
                        <p className="text-lg font-black text-blue-600">{emp.monthReviewsCount != null ? (emp.monthReviewsCount % 1 === 0 ? emp.monthReviewsCount : emp.monthReviewsCount.toFixed(1)) : 0}</p>
                        <p className="text-[10px] text-gray-400">رصيد الشهر</p><BalanceGrowth employee={emp} />
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
              <div className="bg-teal-700 p-4 text-white flex justify-between items-center shrink-0">
                <h3 className="text-xl font-bold flex items-center gap-2"><Building2 size={24} /> الفروع</h3>
                <button 
                  onClick={() => { setShowAllBranchesModal(false); handleModalClose(); }}
                  aria-label="إغلاق نشاط الفرع"
                      className="p-2 bg-teal-600/50 hover:bg-teal-600 rounded-full"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="p-4 bg-gray-50 overflow-y-auto flex-1 space-y-4">
                {syncError ? <p role="alert" className="text-red-700">{syncError}</p> : !summaryReady && <p role="status">جارٍ تحميل بيانات الفروع…</p>}
                {summaryReady && branches.map(branchName => {
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
                              <EmployeeAvatar employee={emp} className="w-8 h-8 rounded-full border shrink-0" />
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
        const branchActivityReviews = reviewSummaries.filter(review => review.branch === modalBranchName);
        const branchReviews = branchActivityReviews.filter(review => isInCurrentMonth(review.date));

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
                  onClick={() => { setShowBranchModal(false); setManualBranchName(null); handleModalClose(); }}
                />
                <motion.div 
                  initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }}
                  className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-y-auto flex flex-col max-h-[90vh] md:max-h-[85vh]"
                >
                  <div className="bg-teal-700 p-4 text-white flex justify-between items-center shrink-0">
                    <h3 className="text-xl font-bold">{modalBranchName}</h3>
                    <button 
                      onClick={() => { setShowBranchModal(false); setManualBranchName(null); handleModalClose(); }}
                      aria-label="إغلاق نشاط الفرع"
                      className="p-2 bg-teal-600/50 hover:bg-teal-600 rounded-full"
                    >
                      <X size={20} />
                    </button>
                  </div>

                  <div aria-label="ملخص الفرع" className="bg-white p-4 border-b border-blue-100 grid grid-cols-3 gap-2 text-center shrink-0">
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

                  <div className="p-4 bg-teal-50/50 border-b border-teal-100 shrink-0">
                    <ActivityChart key={modalBranchName} reviews={branchActivityReviews} subject="branch" />
                  </div>

                  {/* Employees List */}
                  <div aria-label="موظفات الفرع" className="p-3 border-t border-gray-100 shrink-0">
                     <div className="flex flex-wrap justify-center gap-1.5">
                       {users.filter(u => u.branch === modalBranchName && u.role === 'employee').map(emp => (
                         <EmployeeCard key={emp.id} employee={emp} onModalOpen={handleModalOpen} onModalClose={handleModalClose}>
                         <button type="button" aria-label={`عرض سجل ${emp.name}`}
                           className="px-3 py-1 rounded-full text-[10px] sm:text-xs font-bold text-blue-900 bg-transparent border border-blue-100 shadow-[0_0_6px_rgba(59,130,246,0.2)] hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
                         >
                           {emp.name}
                         </button>
                         </EmployeeCard>
                       ))}
                     </div>
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
