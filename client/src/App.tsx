import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import { isAuthenticated } from './lib/api';

// Lazy loading delle pagine: ogni route viene caricata on-demand.
// Riduce il bundle iniziale (recharts è pesante e serve solo a Dashboard/Performance).
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Portfolio = lazy(() => import('./pages/Portfolio'));
const Allocation = lazy(() => import('./pages/Allocation'));
const AssetDetail = lazy(() => import('./pages/AssetDetail'));
const Movements = lazy(() => import('./pages/Movements'));
const Orders = lazy(() => import('./pages/Orders'));
const ImportPage = lazy(() => import('./pages/ImportPage'));
const Settings = lazy(() => import('./pages/Settings'));
const Login = lazy(() => import('./pages/Login'));
const Performance = lazy(() => import('./pages/Performance'));
const Rischi = lazy(() => import('./pages/Rischi'));
const About = lazy(() => import('./pages/About'));

// Fallback durante il caricamento dei chunk lazy
function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="text-slate-400 text-lg">Caricamento...</div>
    </div>
  );
}

// Componente che protegge le rotte: se non autenticato, reindirizza a /login
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/portfolio" element={<Portfolio />} />
          <Route path="/allocation" element={<Allocation />} />
          <Route path="/asset/:id" element={<AssetDetail />} />
          <Route path="/movements" element={<Movements />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/performance" element={<Performance />} />
          <Route path="/rischi" element={<Rischi />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/about" element={<About />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}