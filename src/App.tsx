import { lazy, Suspense, useState } from 'react';
import { PageLoading } from './components/Brand';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
const Leaderboard = lazy(() => import('./pages/Leaderboard').then(m => ({ default: m.Leaderboard })));
import { Login } from './pages/Login';
const Dashboard = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
import { useData } from './context/DataContext';
import { useAuth } from './context/AuthContext';
import { ChangePasswordModal } from './components/ChangePasswordModal';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth();
  const [passwordChangeCompleted, setPasswordChangeCompleted] = useState(false);
  if (!ready) return <PageLoading />;
  if (!user) return <Navigate to="/login" replace />;
  return <>
    <ChangePasswordModal
      isOpen={user.mustChangePassword !== false && !passwordChangeCompleted}
      isMandatory
      onClose={() => setPasswordChangeCompleted(true)}
    />
    {children}
  </>;
}

function App() {
  const { syncError, currentAccount } = useData();
  return (
    <>
    {currentAccount && syncError && <div role="alert" dir="rtl" className={`px-4 py-2 text-sm text-center ${syncError ? "bg-red-100 text-red-900" : "bg-emerald-50 text-emerald-900"}`}>{syncError}</div>}
    <HashRouter>
      <Suspense fallback={<PageLoading />}><Routes>
        <Route path="/" element={<ProtectedRoute><Leaderboard /></ProtectedRoute>} />
        <Route path="/login" element={<Login />} />
        <Route 
          path="/dashboard" 
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          } 
        />
        {/* Redirect old admin route to unified dashboard */}
        <Route path="/admin" element={<Navigate to="/dashboard" replace />} />
      </Routes></Suspense>
    </HashRouter>
    </>
  );
}

export default App;
