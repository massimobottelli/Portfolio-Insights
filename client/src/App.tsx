import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Portfolio from './pages/Portfolio';
import Allocation from './pages/Allocation';
import AssetDetail from './pages/AssetDetail';
import Movements from './pages/Movements';
import ImportPage from './pages/ImportPage';
import Settings from './pages/Settings';
import Login from './pages/Login';
import { isAuthenticated } from './lib/api';

// Componente che protegge le rotte: se non autenticato, reindirizza a /login
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
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
        <Route path="/import" element={<ImportPage />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}