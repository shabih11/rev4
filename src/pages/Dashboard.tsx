import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { AdminDashboard } from './AdminDashboard'; // this is branch manager now
import { SystemAdminDashboard } from './SystemAdminDashboard';
import { EmployeeDashboard } from './EmployeeDashboard';

export const Dashboard: React.FC = () => {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role === 'admin') {
    return <SystemAdminDashboard />;
  }

  if (user.role === 'manager') {
    return <AdminDashboard />;
  }

  return <EmployeeDashboard />;
};
