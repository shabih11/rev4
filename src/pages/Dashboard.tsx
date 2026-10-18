import React from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Trophy } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { AdminDashboard } from './AdminDashboard';
import { SystemAdminDashboard } from './SystemAdminDashboard';
import { EmployeeDashboard } from './EmployeeDashboard';

export const Dashboard: React.FC = () => {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <>
    <nav className="bg-white px-4 py-3 border-b flex justify-end font-alexandria" dir="rtl" aria-label="التنقل الرئيسي">
      <Link to="/" className="inline-flex items-center gap-2 text-blue-600 font-bold"><Trophy size={18}/> لوحة الترتيب</Link>
    </nav>
    {user.role === 'admin' ? <SystemAdminDashboard /> : user.role === 'manager' ? <AdminDashboard /> : <EmployeeDashboard />}
  </>;
};
