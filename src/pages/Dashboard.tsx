import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { AdminDashboard } from './AdminDashboard';
import { SystemAdminDashboard } from './SystemAdminDashboard';
import { EmployeeDashboard } from './EmployeeDashboard';

export const Dashboard: React.FC = () => {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return user.role === 'admin' ? <SystemAdminDashboard /> : user.role === 'manager' ? <AdminDashboard /> : <EmployeeDashboard />;
};

