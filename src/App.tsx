import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Leaderboard } from './pages/Leaderboard';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { useData } from './context/DataContext';
import { useAuth } from './context/AuthContext';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth();
  if (!ready) return <p dir="rtl" className="p-8 text-center">جارٍ التحقق من تسجيل الدخول…</p>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function App() {
  const { syncStatus, syncError, currentAccount } = useData();
  return (
    <>
    {currentAccount && <div role={syncError ? "alert" : "status"} dir="rtl" className={`px-4 py-2 text-sm text-center ${syncError ? "bg-red-100 text-red-900" : "bg-emerald-50 text-emerald-900"}`}>{syncError || syncStatus}</div>}
    <HashRouter>
      <Routes>
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
      </Routes>
    </HashRouter>
    </>
  );
}

export default App;
