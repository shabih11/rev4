import { EmployeeDetails } from './EmployeeCard';
import { useData } from '../context/DataContext';
import { BranchMilestoneBadge } from './BranchMilestoneBadge';
import { EmployeeIdentity } from './EmployeeIdentity';
import React, { useState } from 'react';
import { User, Lock, Mail, Shield, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const UserProfileTab: React.FC = () => {
  const { user, changePassword } = useAuth();

  const { users } = useData();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);

  const [passMsg, setPassMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [isUpdatingPass, setIsUpdatingPass] = useState(false);

  if (!user) return null;

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (user.role !== 'admin') return;
    setPassMsg(null);

    const cleanPass = newPassword.trim();
    if (cleanPass.length < 6) {
      setPassMsg({ text: 'كلمة المرور يجب أن تكون 6 خانات على الأقل', type: 'error' });
      return;
    }
    if (cleanPass !== confirmPassword.trim()) {
      setPassMsg({ text: 'كلمة المرور وتأكيدها غير متطابقين', type: 'error' });
      return;
    }

    setIsUpdatingPass(true);
    const res = await changePassword(cleanPass);
    setIsUpdatingPass(false);

    if (res.success) {
      setNewPassword('');
      setConfirmPassword('');
      setPassMsg({ text: 'تم تحديث كلمة المرور بنجاح!', type: 'success' });
      setTimeout(() => setPassMsg(null), 3500);
    } else {
      setPassMsg({ text: res.error || 'تعذر تحديث كلمة المرور', type: 'error' });
    }
  };

  const roleTitle = user.role === 'admin' ? 'الإدارة العامة' : user.role === 'manager' ? 'إدارة الفرع' : 'موظفة فرع';

  return (
    <div className="profile-panel max-w-2xl mx-auto space-y-6 font-sans" dir="rtl">
      {/* Account Info Header Card */}
      {user.role === 'employee' ? <EmployeeDetails employee={users.find(employee => employee.id === user.id) ?? user} showCoverageBranch embedded /> : <div className="profile-summary text-white p-6 sm:p-8 rounded-3xl relative overflow-hidden">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 relative z-10 text-center sm:text-right">
          <div className="w-20 h-20 rounded-2xl bg-white/15 backdrop-blur-md border border-white/20 flex items-center justify-center text-white shrink-0 shadow-inner">
            <User size={40} />
          </div>
          <div className="flex-1 min-w-0 space-y-3">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-xs font-bold mb-1">
              <Shield size={13} />
              {roleTitle}
            </div>
            <h2 className="flex flex-wrap items-center gap-2 text-2xl font-black">{user.role === 'manager' ? user.branch : <EmployeeIdentity employee={user} className="employee-identity-on-dark" />}{user.role === 'manager' && <BranchMilestoneBadge branch={user.branch} />}</h2>
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4 text-xs text-blue-100 pt-1">
              {user.username && <span className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm">اسم المستخدم: <bdi className="select-text">{user.username}</bdi></span>}
              {user.email && (
                <span className="inline-flex max-w-full items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm" dir="ltr">
                  <Mail size={14} className="shrink-0" /> <span className="break-all">{user.email}</span>
                </span>
              )}
            </div>
          </div>
        </div>
      </div>}

      {/* Change Password Card */}
      {user.role === 'admin' && <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-4">
        <div className="flex items-center gap-2.5 border-b pb-3">
          <Lock className="text-amber-600" size={20} />
          <h3 className="font-bold text-gray-800 text-base">تغيير كلمة المرور</h3>
        </div>

        {passMsg && (
          <div className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${passMsg.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
            {passMsg.type === 'success' && <CheckCircle2 size={16} />}
            <span>{passMsg.text}</span>
          </div>
        )}

        <form onSubmit={handleUpdatePassword} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5">كلمة المرور الجديدة</label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="6 خانات على الأقل..."
                className="w-full p-3 pr-4 pl-10 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 bg-gray-50 focus:bg-white transition"
                dir="ltr"
                required
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
              >
                {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5">تأكيد كلمة المرور الجديدة</label>
            <input
              type={showPass ? 'text' : 'password'}
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="تأكيد كلمة المرور الجديدة..."
              className="w-full p-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 bg-gray-50 focus:bg-white transition"
              dir="ltr"
              required
            />
          </div>

          <button
            type="submit"
            disabled={isUpdatingPass}
            className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-2.5 px-6 rounded-xl transition text-sm flex items-center gap-2 shadow-sm disabled:opacity-50 cursor-pointer"
          >
            <Lock size={16} />
            {isUpdatingPass ? 'جارٍ التحديث...' : 'تحديث كلمة المرور'}
          </button>
        </form>
      </div>}


    </div>
  );
};
