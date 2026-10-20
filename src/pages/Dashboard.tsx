import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { AdminDashboard } from './AdminDashboard';
import { SystemAdminDashboard } from './SystemAdminDashboard';
import { EmployeeDashboard } from './EmployeeDashboard';

export const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const { summaryReady, requestBasicSummary, syncError } = useData();
  if (!user) return <Navigate to="/login" replace />;
  return <>
    {!summaryReady && <div className="p-3 text-center bg-amber-50 text-sm" dir="rtl">
      <p>{syncError || 'جارٍ تحميل الملخص اليومي…'}</p>
      <button onClick={requestBasicSummary} className="mt-2 rounded-lg border px-3 py-2">تحميل البيانات الأساسية عند الطلب</button>
    </div>}
    {user.role === 'admin' ? <SystemAdminDashboard /> : user.role === 'manager' ? <AdminDashboard /> : <EmployeeDashboard />}
  </>;
};
