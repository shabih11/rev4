import { BarChart3, Zap, CalendarClock, Users } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { newestFirst } from '../../lib/employeeActivity';
import { formatDateTime } from '../../lib/formatDate';

export function ReviewsTab({ globalBranch, branches, selectedTimelineBranch, effectiveTimelineBranch, viewingReviewsMonth,
  setSelectedTimelineBranch, setViewingReviewsMonth, onFeatures, handleGlobalBranchChange }: {
  globalBranch: string;
  branches: string[];
  selectedTimelineBranch: string;
  effectiveTimelineBranch: string;
  viewingReviewsMonth: string;
  setSelectedTimelineBranch: (branch: string) => void;
  setViewingReviewsMonth: (month: string) => void;
  onFeatures: () => void;
  handleGlobalBranchChange: (branch: string) => void;
}) {
  const { reviews, users } = useData();
  return (
            <div>
              <div className="flex items-center gap-3 mb-6 border-b pb-4">
                <BarChart3 className="text-blue-600" size={28} />
                <h2 className="text-2xl font-bold text-gray-800">الإحصائيات والتقييمات</h2>
              </div>

              {/* Windsor info banner replacing manual injection */}
              <div className="bg-gradient-to-r from-purple-50 via-indigo-50 to-blue-50 p-6 rounded-2xl border border-indigo-100 mb-8 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-purple-600 text-white rounded-xl shadow-md">
                    <Zap size={24} />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-gray-900 text-lg">المصدر المعتمد: تكامل Windsor.ai التلقائي</h3>
                    <p className="text-sm text-gray-600 mt-0.5">
                      يتم جلب واستدعاء كافة تقييمات الفروع وربطها تلقائياً بالموظفات عبر تكامل Windsor.ai المباشر مع Google Business.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => onFeatures()}
                  className="bg-purple-600 hover:bg-purple-700 text-white font-bold px-5 py-2.5 rounded-xl shadow-sm transition flex items-center gap-2 text-sm shrink-0 cursor-pointer"
                >
                  <Zap size={16} />
                  إدارة الميزات الإضافية
                </button>
              </div>

              <h3 className="font-bold text-xl mb-6 border-b pb-2 flex items-center gap-2 text-gray-800">
                <BarChart3 className="text-gray-500"/> استعراض تقييمات الفروع
              </h3>

              {globalBranch === 'all' ? (
                <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
                  {branches.map(b => (
                    <button
                      key={b}
                      onClick={() => { setSelectedTimelineBranch(b); setViewingReviewsMonth(''); }}
                      className={`px-4 py-2 rounded-lg font-bold whitespace-nowrap ${selectedTimelineBranch === b ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                    >
                      فرع {b}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-between mb-6 bg-blue-50 border border-blue-200 text-blue-900 px-4 py-3 rounded-xl font-bold text-sm">
                  <span>عرض تقييمات {globalBranch === 'موظفة خارجية' ? 'الموظفات المتنقلات' : `فرع ${globalBranch}`}</span>
                  <button onClick={() => handleGlobalBranchChange('all')} className="text-xs bg-white text-blue-700 px-3 py-1.5 rounded-lg border border-blue-200 hover:bg-blue-100 shadow-sm transition">
                    عرض كل الفروع
                  </button>
                </div>
              )}

              <div className="mb-6 flex justify-between items-center bg-gray-50 p-4 rounded-xl border">
                <h4 className="font-bold text-gray-700">التقييمات المسجلة: {reviews.filter(r => r.branch === effectiveTimelineBranch).length}</h4>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500 font-bold">الفلترة:</span>
                  <select
                    value={viewingReviewsMonth}
                    onChange={e => setViewingReviewsMonth(e.target.value)}
                    className="p-2 border rounded-lg bg-white text-sm font-bold"
                  >
                    <option value="">جميع الأشهر</option>
                    {Array.from(new Set(reviews.filter(r => r.branch === effectiveTimelineBranch).map(r => r.date.substring(3)))).map(m => (
                      <option key={m as string} value={m as string}>{m as string}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {reviews.filter(r => r.branch === effectiveTimelineBranch && (viewingReviewsMonth ? r.date.endsWith(viewingReviewsMonth) : true)).sort(newestFirst).map(r => (
                  <div key={r.id} className="bg-white p-5 rounded-xl border shadow-sm flex flex-col gap-3 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-2 h-full bg-yellow-400"></div>
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xl shrink-0">
                        {r.reviewerName.charAt(0)}
                      </div>
                      <div className="flex-1">
                        <h5 className="font-bold text-lg text-gray-800">{r.reviewerName}</h5>
                        <div className="flex gap-1 text-yellow-400 my-1 text-xs">
                          ★★★★★
                        </div>
                        <p className="text-gray-700 text-sm mt-2 leading-relaxed">"{r.comment}"</p>
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
                      <div className="flex items-center gap-1 font-medium bg-gray-50 px-2 py-1 rounded">
                        <CalendarClock size={12}/> {formatDateTime(r.date, r.time)}
                      </div>
                      {r.linkedEmployeeIds && r.linkedEmployeeIds.length > 0 ? (
                        <div className="flex items-center gap-1 font-bold text-green-700 bg-green-50 px-2 py-1 rounded border border-green-100">
                          <Users size={12}/> {r.linkedEmployeeIds.map(id => users.find(u => u.id === id)?.name).join('، ')}
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 font-bold text-red-600 bg-red-50 px-2 py-1 rounded border border-red-100">
                          غير مرتبط
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {reviews.filter(r => r.branch === effectiveTimelineBranch).length === 0 && (
                  <div className="col-span-full text-center text-gray-500 py-12 border-dashed border-2 rounded-xl flex flex-col items-center gap-3">
                    <BarChart3 size={48} className="text-gray-300"/>
                    <p className="font-bold text-lg">لا توجد تقييمات مسجلة لهذا الفرع بعد.</p>
                  </div>
                )}
              </div>
            </div>
  );
}
