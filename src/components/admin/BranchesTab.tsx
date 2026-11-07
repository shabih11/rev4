import { Users } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { belongsToBranch } from '../../lib/employeeBranches';
import { employeeQualityPoints } from '../../lib/employeeQuality';
import { EmployeeIdentity } from '../EmployeeIdentity';
import { AdministrationPhone } from '../MissingShiftRequest';
import employeeImg from '../../assets/employee.png';

export function BranchesTab({ globalBranch, branches, showToast }: {
  globalBranch: string;
  branches: string[];
  showToast: (message: string) => void;
}) {
  const { users, branchSettings, updateBranchSettings } = useData();
  return (
            <div>
              <h2 className="text-xl font-bold mb-6 border-b pb-2">إدارة الفروع</h2>
              <AdministrationPhone />

              <div className="space-y-6">
                {(globalBranch === 'all' ? branches : (globalBranch === 'موظفة خارجية' ? [] : [globalBranch])).map(branch => {
                  const currentBranchEmployees = users.filter(u => belongsToBranch(u, branch) && u.role === 'employee');
                  return (
                    <div key={`${branch}:${JSON.stringify(branchSettings[branch] || {})}`} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col gap-6">
                      <div className="flex justify-between items-center border-b pb-4">
                        <div className="flex-1">
                          <label className="block text-sm font-bold text-gray-700 mb-1">اسم الفرع (تعديل)</label>
                          <input type="text" defaultValue={`فرع ${branch}`} className="w-64 p-2 border rounded font-bold text-gray-800 bg-gray-50 focus:bg-white"
                            onBlur={() => showToast('تعديل اسم الفرع غير مدعوم في هذه النسخة لتجنب تعارض البيانات')} />
                        </div>
                        <div className="text-sm bg-blue-50 text-blue-700 px-4 py-2 rounded-lg font-bold flex items-center gap-2">
                          <Users size={16}/>
                          {currentBranchEmployees.length} موظفات
                        </div>
                      </div>

                      <div className="grid md:grid-cols-2 gap-8">
                        {/* Settings Form */}
                        <div className="bg-gray-50 p-5 rounded-lg border border-gray-100">
                          <h4 className="font-bold text-gray-700 mb-4 border-b pb-2">أوقات العمل الافتراضية</h4>
                          <div className="grid grid-cols-2 gap-4 mb-4">
                            <div>
                              <label className="block text-xs font-bold text-gray-600 mb-1">وقت البدء</label>
                              <input id={`start-${branch}`} type="time" defaultValue={branchSettings[branch]?.start || '16:00'} className="w-full p-2 border rounded" />
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-gray-600 mb-1">وقت الانتهاء (نفس اليوم)</label>
                              <input id={`end-${branch}`} type="time" defaultValue={branchSettings[branch]?.end || '00:00'} className="w-full p-2 border rounded" />
                            </div>
                            <div className="col-span-2">
                              <label className="block text-xs font-bold text-gray-600 mb-1">وقت اليوم التالي</label>
                              <input id={`nextday-${branch}`} type="time" defaultValue={branchSettings[branch]?.nextDayTime || '10:00'} className="w-full p-2 border rounded" />
                            </div>
                            <div className="col-span-2">
                              <label className="block text-xs font-bold text-gray-600 mb-1">رابط Google API</label>
                              <input id={`api-${branch}`} type="text" placeholder="https://..." defaultValue={branchSettings[branch]?.googleApi || ''} className="w-full p-2 border rounded text-left" dir="ltr" />
                            </div>
                          </div>
                          <button onClick={() => {
                            const start = (document.getElementById(`start-${branch}`) as HTMLInputElement).value;
                            const end = (document.getElementById(`end-${branch}`) as HTMLInputElement).value;
                            const nextDayTime = (document.getElementById(`nextday-${branch}`) as HTMLInputElement).value;
                            const googleApi = (document.getElementById(`api-${branch}`) as HTMLInputElement).value;
                            updateBranchSettings(branch, start, end, googleApi, nextDayTime);
                            showToast(`تم حفظ إعدادات فرع ${branch}`);
                          }} className="w-full bg-blue-600 text-white p-3 rounded-lg font-bold hover:bg-blue-700 transition-colors">
                            حفظ إعدادات {branch}
                          </button>
                        </div>

                        {/* Employees List */}
                        <div className="bg-gray-50 p-5 rounded-lg border border-gray-100">
                          <h4 className="font-bold text-gray-700 mb-4 border-b pb-2">موظفات الفرع</h4>
                          <div className="max-h-64 overflow-y-auto space-y-2 pr-2">
                            {currentBranchEmployees.map(emp => (
                              <div key={emp.id} className="flex items-center gap-3 bg-white p-2 rounded-lg border shadow-sm">
                                <img src={emp.imageUrl || employeeImg} alt={emp.name} className="w-10 h-10 rounded-full object-cover border" />
                                <div>
                                  <EmployeeIdentity employee={emp} className="text-sm text-gray-800"/>
                                  <p className="text-xs text-gray-500 mt-1">
                                    <span className="text-green-600 font-bold">{emp.stats.positive.toFixed(1)}</span> إيجابي | <span className="text-blue-700 font-bold">{employeeQualityPoints(emp.stats).toFixed(1)}</span> جودة من 6
                                  </p>
                                </div>
                              </div>
                            ))}
                            {currentBranchEmployees.length === 0 && (
                              <p className="text-center text-sm text-gray-500 py-6">لا يوجد موظفات مسجلات في هذا الفرع.</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
  );
}
