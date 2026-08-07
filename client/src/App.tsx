import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Portfolio from './pages/Portfolio';
import Movements from './pages/Movements';
import ImportPage from './pages/ImportPage';
import Settings from './pages/Settings';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/portfolio" element={<Portfolio />} />
        <Route path="/movements" element={<Movements />} />
        <Route path="/import" element={<ImportPage />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}