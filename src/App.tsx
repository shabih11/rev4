import { lazy, Suspense } from 'react';
import { PageLoading } from './components/Brand';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
const Leaderboard = lazy(() => import('./pages/Leaderboard').then(m => ({ default: m.Leaderboard })));
import { Login } from './pages/Login';
const Dashboard = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
import { useData } from './context/DataContext';
import { useAuth } from './context/AuthContext';
import { AccountSetup } from './components/AccountSetup';
import { requireAccountSetup } from './lib/accountSetupConfig';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth();
  if (!ready) return <PageLoading />;
  if (!user) return <Navigate to="/login" replace />;
  if (requireAccountSetup && (user.mustSetUsername !== false || user.mustChangePassword !== false)) return <AccountSetup />;
  return children;
}

function App() {
  const { syncError, currentAccount, resultsMode, resultsDate, setResultsMode } = useData();
  const periodKey = resultsMode ? resultsDate.toISOString() : 'current';
  return (
    <div>
    {currentAccount && resultsMode && <div dir="rtl" className="flex flex-wrap items-center justify-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <p role="status">عرض النتائج حتى {resultsDate.toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { timeZone: 'Asia/Riyadh', day: 'numeric', month: 'long', year: 'numeric' })}</p>
      <button type="button" onClick={() => setResultsMode(false)} className="rounded-lg border border-amber-300 bg-white px-3 py-2 font-bold hover:bg-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-700">العودة للبيانات الحالية</button>
    </div>}
    {currentAccount && syncError && <div role="alert" dir="rtl" className={`px-4 py-2 text-sm text-center ${syncError ? "bg-red-100 text-red-900" : "bg-emerald-50 text-emerald-900"}`}>{syncError}</div>}
    <HashRouter>
      <Suspense fallback={<PageLoading />}><Routes>
        <Route path="/" element={<ProtectedRoute><Leaderboard key={periodKey} /></ProtectedRoute>} />
        <Route path="/login" element={<Login />} />
        <Route 
          path="/dashboard" 
          element={
            <ProtectedRoute>
              <Dashboard key={periodKey} />
            </ProtectedRoute>
          } 
        />
        {/* Redirect old admin route to unified dashboard */}
        <Route path="/admin" element={<Navigate to="/dashboard" replace />} />
      </Routes></Suspense>
    </HashRouter>
    </div>
  );
}

export default App;
