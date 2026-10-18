import React, { useState } from 'react';
import { ShieldAlert, Lock, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  isMandatory?: boolean;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({
  isOpen,
  onClose,
  isMandatory = false,
}) => {
  const { user, changePassword } = useAuth();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  if (!isOpen || !user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanPass = newPassword.trim();
    if (cleanPass.length < 6) {
      setError('كلمة المرور يجب أن تكون 6 خانات على الأقل');
      return;
    }
    if (cleanPass !== confirmPassword.trim()) {
      setError('كلمة المرور وتأكيدها غير متطابقين');
      return;
    }

    setIsSubmitting(true);
    const res = await changePassword(cleanPass);
    setIsSubmitting(false);

    if (res.success) {
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 1500);
    } else {
      setError(res.error || 'تعذر تغيير كلمة المرور');
    }
  };

  return (
    <div className="fixed inset-0 z-[150] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in font-sans" dir="rtl">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl border border-gray-100 relative overflow-hidden">
        {/* Top header accent */}
        <div className="absolute top-0 right-0 left-0 h-2 bg-gradient-to-r from-amber-500 via-orange-500 to-red-500"></div>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center shrink-0">
            <ShieldAlert size={26} />
          </div>
          <div>
            <h3 className="text-lg font-extrabold text-gray-900">تنبيه أمني لتسجيل الدخول</h3>
            <p className="text-xs text-gray-500 font-medium">حساب {user.name} ({user.branch})</p>
          </div>
        </div>

        {success ? (
          <div className="py-8 text-center space-y-3">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 size={36} />
            </div>
            <h4 className="text-lg font-bold text-gray-900">تم تغيير كلمة المرور بنجاح!</h4>
            <p className="text-sm text-gray-500">تم حفظ كلمة المرور الجديدة وتأمين حسابك.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="bg-amber-50/80 border border-amber-200/80 p-3.5 rounded-2xl text-xs text-amber-900 leading-relaxed font-medium">
              لحماية حسابك وبياناتك، عيّني كلمة مرور خاصة بكِ قبل متابعة استخدام التطبيق.
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 p-3 rounded-xl text-xs text-red-700 font-bold text-center">
                {error}
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">كلمة المرور الجديدة</label>
              <div className="relative">
                <Lock className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type={showPass ? 'text' : 'password'}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="أدخلي 6 خانات على الأقل..."
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl pr-10 pl-10 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition"
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
              <div className="relative">
                <Lock className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type={showPass ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="أعيدي كتابة كلمة المرور..."
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl pr-10 pl-10 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition"
                  dir="ltr"
                  required
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold py-3 px-4 rounded-xl shadow-md transition disabled:opacity-50 text-sm cursor-pointer"
              >
                {isSubmitting ? 'جارٍ الحفظ...' : 'تحديث كلمة المرور'}
              </button>

              {!isMandatory && (
                <button
                  type="button"
                  onClick={onClose}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-3 px-4 rounded-xl transition text-sm cursor-pointer"
                >
                  تخطي لاحقاً
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
