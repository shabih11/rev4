import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { AdminDashboard } from './AdminDashboard';
import { SystemAdminDashboard } from './SystemAdminDashboard';
import { EmployeeDashboard } from './EmployeeDashboard';

export const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const { summaryReady, syncError } = useData();
  if (!user) return <Navigate to="/login" replace />;
  return <>
    {!summaryReady && <div className="p-3 text-center bg-amber-50 text-sm" dir="rtl">
      <p>{syncError || 'جارٍ تحميل الملخص اليومي…'}</p>
    </div>}
    {user.role === 'admin' ? <SystemAdminDashboard /> : user.role === 'manager' ? <AdminDashboard /> : <EmployeeDashboard />}
  </>;
};
