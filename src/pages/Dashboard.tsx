import React, { lazy, Suspense } from 'react';
import { PageLoading } from '../components/Brand';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
const AdminDashboard = lazy(() => import('./AdminDashboard').then(m => ({ default: m.AdminDashboard })));
const SystemAdminDashboard = lazy(() => import('./SystemAdminDashboard').then(m => ({ default: m.SystemAdminDashboard })));
const EmployeeDashboard = lazy(() => import('./EmployeeDashboard').then(m => ({ default: m.EmployeeDashboard })));

export const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const { summaryReady, syncError } = useData();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'viewer') return <Navigate to="/" replace />;
  return <>
    {!summaryReady && <div className="p-3 text-center bg-amber-50 text-sm" dir="rtl">
      <p>{syncError || 'جارٍ تحميل الملخص اليومي…'}</p>
    </div>}
    <Suspense fallback={<PageLoading />}>{user.role === 'admin' ? <SystemAdminDashboard /> : user.role === 'manager' ? <AdminDashboard /> : <EmployeeDashboard />}</Suspense>
  </>;
};
