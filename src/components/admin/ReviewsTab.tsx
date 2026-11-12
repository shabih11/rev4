import { BarChart3, CalendarClock, Users } from 'lucide-react';
import { useState } from 'react';
import { useData } from '../../context/DataContext';
import { newestFirst } from '../../lib/employeeActivity';
import { formatDateTime } from '../../lib/formatDate';

export function ReviewsTab({ branch }: { branch: string }) {
  const { reviews, users, recordsReady, syncError } = useData();
  const [viewingReviewsMonth, setViewingReviewsMonth] = useState('');
  const branchReviews = reviews.filter(review => review.branch === branch);
  if (syncError || !recordsReady) return <p role="status">{syncError ? 'تعذر تحميل التقييمات.' : 'جارٍ تحميل التقييمات…'}</p>;

  return (
            <div>
              <div className="mb-6 flex justify-between items-center bg-gray-50 p-4 rounded-xl border">
                <h4 className="font-bold text-gray-700">التقييمات المسجلة: {branchReviews.length}</h4>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500 font-bold">الفلترة:</span>
                  <select aria-label="شهر التقييم"
                    value={viewingReviewsMonth}
                    onChange={e => setViewingReviewsMonth(e.target.value)}
                    className="p-2 border rounded-lg bg-white text-sm font-bold"
                  >
                    <option value="">جميع الأشهر</option>
                    {Array.from(new Set(branchReviews.map(r => r.date.substring(3)))).map(m => (
                      <option key={m as string} value={m as string}>{m as string}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {branchReviews.filter(r => !viewingReviewsMonth || r.date.endsWith(viewingReviewsMonth)).sort(newestFirst).map(r => (
                  <div key={r.id} className="bg-white p-5 rounded-xl border shadow-sm flex flex-col gap-3 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-2 h-full bg-yellow-400"></div>
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xl shrink-0">
                        {r.reviewerName.charAt(0)}
                      </div>
                      <div className="flex-1">
                        <h5 className="font-bold text-lg text-gray-800">{r.reviewerName}</h5>
                        <div className="flex gap-1 text-yellow-400 my-1 text-xs">
                          ★ {r.rating}
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
                {branchReviews.length === 0 && (
                  <div className="col-span-full text-center text-gray-500 py-12 border-dashed border-2 rounded-xl flex flex-col items-center gap-3">
                    <BarChart3 size={48} className="text-gray-300"/>
                    <p className="font-bold text-lg">لا توجد تقييمات مسجلة لهذا الفرع بعد.</p>
                  </div>
                )}
              </div>
            </div>
  );
}
