import { useUsagePage } from '../hooks/useUsageAnalytics';
import { BranchMilestoneBadge } from '../components/BranchMilestoneBadge';
import { EmployeeIdentity } from '../components/EmployeeIdentity';
import { gemTheme } from '../lib/gems';
import { EmployeeAvatar } from '../components/EmployeeFeatures';
import { Brand } from '../components/Brand';
import { MissingShiftRequest } from '../components/MissingShiftRequest';
import { EmployeeResults } from '../components/EmployeeResults';
import { LeaderboardLink } from '../components/LeaderboardLink';
import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { LogOut, Award, User, Shirt } from 'lucide-react';
import { AvatarStore } from '../components/AvatarStore';
import { UserProfileTab } from '../components/UserProfileTab';
import { EmployeeMissions } from '../components/EmployeeMissions';

export const EmployeeDashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const { summaryReady, syncError, users, features } = useData();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'avatar' | 'profile'>('dashboard');
  useUsagePage(activeTab);
  if (!user) return null;
  const displayedEmployee = users.find(employee => employee.id === user.id) || user;

  return (
    <div data-gem-theme={gemTheme(features?.store?.magic, user.id)} className={`gem-employee-page w-full min-h-screen font-sans pb-24 ${activeTab === 'avatar' ? 'employee-store-page bg-white' : 'bg-gray-50'}`} dir="rtl">
      {activeTab === 'profile' ? (
        <div className="p-4 sm:p-6 max-w-2xl mx-auto">
          <UserProfileTab />
        </div>
      ) : activeTab === 'avatar' ? (
        <div className="w-full py-4 sm:py-6 space-y-4">
          <h1 className="px-4 sm:px-6 text-2xl font-bold text-slate-800">افتار</h1>
          {!summaryReady ? <p role="status">جارٍ تحميل متجر الأفتارات…</p> : syncError ? <p role="alert" className="text-red-700">تعذر تحميل متجر الأفتارات.</p> : features?.settings.avatars ? <AvatarStore employee={displayedEmployee} /> : <p className="bg-white p-5 text-slate-600">متجر الأفتارات غير متاح حاليًا.</p>}
        </div>
      ) : (
        <>
          {/* Header */}
          <div className="bg-white pt-6 px-6 shadow-sm rounded-b-3xl mb-6 relative overflow-hidden flex flex-col items-center border-b">
        <div className="flex justify-between items-center w-full z-10 mb-4">
          <div>
            <Brand compact />
            <h1 className="flex items-center gap-2 text-2xl font-bold mb-1 text-gray-800"><EmployeeIdentity employee={displayedEmployee}/><BranchMilestoneBadge branch={displayedEmployee.isCoverage ? undefined : displayedEmployee.branch} /></h1>
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

      {summaryReady && !syncError && features?.settings.missions === true && <EmployeeMissions key={user.id} employeeId={user.id} />}
      <EmployeeResults user={displayedEmployee} ready={summaryReady} error={syncError} />
      <div className="px-6 mb-8"><MissingShiftRequest currentMonthOnly /></div>

      </>
      )}

      {/* Bottom Navigation */}
      <nav aria-label="تنقل الموظفة" className="fixed bottom-0 left-0 right-0 w-full bg-white/95 backdrop-blur-lg border-t border-slate-200 shadow-[0_-10px_35px_-10px_rgba(0,0,0,0.1)] z-40 px-4 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex justify-around items-center">
        <button
          aria-current={activeTab === 'dashboard' ? 'page' : undefined}
          data-usage-action="navigation" onClick={() => setActiveTab('dashboard')}
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
          aria-current={activeTab === 'avatar' ? 'page' : undefined}
          data-usage-action="navigation" onClick={() => setActiveTab('avatar')}
          className={`tab-button ${activeTab === 'avatar' ? 'text-blue-700 bg-blue-50 font-black' : 'text-slate-400 hover:text-slate-600'}`}
        >
          <Shirt size={22} />
          <span className="text-[11px] font-bold">افتار</span>
        </button>

        <button
          aria-current={activeTab === 'profile' ? 'page' : undefined}
          data-usage-action="navigation" onClick={() => setActiveTab('profile')}
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
